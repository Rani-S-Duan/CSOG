// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ChainSeal OG
/// @notice Protokol Phygital RWA: pelacakan karton (B2B) + pembayaran atomik & Once Guard (B2C).
///  - Factory      = DEFAULT_ADMIN_ROLE (deployer): mint karton, daftarkan entitas.
///  - Distributor  = DISTRIBUTOR_ROLE   : terima & kirim karton.
///  - Seller       = SELLER_ROLE        : terima karton, unpack, jual eceran.
///  - Konsumen     = siapa pun          : verifikasi + bayar (item -> REDEEMED).
/// ID QR (mis. "KARTON-101", "ITEM-101-01") di-hash keccak256 untuk penyimpanan on-chain.
contract ChainSeal is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // ───────────────────────────── Konstanta & tipe ─────────────────────────────
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant SELLER_ROLE = keccak256("SELLER_ROLE");

    uint8 public constant ITEMS_PER_CARTON = 10;
    /// @dev Maksimal perpindahan kepemilikan karton (termasuk serah terima terakhir ke Seller).
    uint8 public constant MAX_TRANSFERS = 5;
    uint256 public constant MAX_ID_LENGTH = 64;

    enum Role { None, Factory, Distributor, Seller }
    enum ItemStatus { None, Sealed, Active, Redeemed }

    struct Carton {
        bool exists;
        bool unpacked;
        uint8 transferCount;
        uint64 mintedAt;
        address holder;
        address pendingTo;
        string code;
        string productName;
        string batchId;
        address[] trail; // jejak kustodi: pabrik -> distributor ... -> seller
        bytes32[] itemKeys;
    }

    struct Item {
        ItemStatus status;
        bytes32 cartonKey;
        address seller;
        uint64 activatedAt;
        uint64 redeemedAt;
        address redeemedBy;
        uint256 price; // dalam satuan terkecil token (USDG = 6 desimal)
    }

    // ───────────────────────────── Storage ─────────────────────────────
    IERC20 public immutable usdg;

    /// @notice Placeholder KYC (MVP). Roadmap: diganti oracle / WaaS verifikasi dokumen.
    mapping(address => bool) public isKYCVerified;
    mapping(address => string) public entityName;

    mapping(bytes32 => Carton) private cartons;
    mapping(bytes32 => Item) private items;

    mapping(address => EnumerableSet.Bytes32Set) private _held;
    mapping(address => EnumerableSet.Bytes32Set) private _incoming;

    address[] private _entityList;
    mapping(address => bool) private _isListed;

    // ───────────────────────────── Views (struct) ─────────────────────────────
    struct EntityView {
        address wallet;
        Role role;
        bool kyc;
        string name;
    }

    struct CartonView {
        bool exists;
        bool unpacked;
        uint8 transferCount;
        uint64 mintedAt;
        address holder;
        address pendingTo;
        string code;
        string productName;
        string batchId;
        address[] trail;
        string[] trailNames;
    }

    struct ItemProof {
        ItemStatus status;
        string cartonCode;
        string productName;
        string batchId;
        address[] trail;
        string[] trailNames;
        uint256 price;
        address seller;
        string sellerName;
        uint64 redeemedAt;
        address redeemedBy;
    }

    // ───────────────────────────── Events ─────────────────────────────
    event EntityRegistered(address indexed wallet, Role role, string name);
    event EntityRevoked(address indexed wallet);
    event KYCStatusChanged(address indexed wallet, bool verified);

    event CartonMinted(bytes32 indexed cartonKey, string code, string productName, string batchId, address indexed factory);
    event ItemRegistered(bytes32 indexed cartonKey, bytes32 indexed itemKey, string code);
    event CartonShipped(bytes32 indexed cartonKey, address indexed from, address indexed to);
    event ShipmentCancelled(bytes32 indexed cartonKey, address indexed from, address indexed to);
    event CartonReceived(bytes32 indexed cartonKey, address indexed from, address indexed to, uint8 transferCount);
    event CartonUnpacked(bytes32 indexed cartonKey, address indexed seller, uint256 retailPrice);
    event ItemRedeemed(bytes32 indexed itemKey, bytes32 indexed cartonKey, address indexed buyer, address seller, uint256 price);

    // ───────────────────────────── Errors ─────────────────────────────
    error InvalidAddress();
    error InvalidRole();
    error InvalidId();
    error InvalidItemCount();
    error AlreadyExists();
    error NotFound();
    error NotVerifiedEntity();
    error NotHolder();
    error NotRecipient();
    error ShipmentPending();
    error NoShipmentPending();
    error AlreadyUnpacked();
    error TransferLimitReached();
    error RecipientNotAllowed();
    error LastHopMustBeSeller();
    error InvalidPrice();
    error NotPayable(ItemStatus status);
    error AlreadyRedeemed();

    // ───────────────────────────── Constructor ─────────────────────────────
    constructor(address usdgToken, string memory factoryName) {
        if (usdgToken == address(0)) revert InvalidAddress();
        usdg = IERC20(usdgToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        entityName[msg.sender] = factoryName;
    }

    // ═════════════════════ 1. RBAC + KYC (placeholder MVP) ═════════════════════

    /// @notice Daftarkan Distributor / Seller sekaligus centang KYC = true.
    function registerEntity(address wallet, Role role, string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (wallet == address(0)) revert InvalidAddress();
        if (role == Role.Distributor) {
            _grantRole(DISTRIBUTOR_ROLE, wallet);
        } else if (role == Role.Seller) {
            _grantRole(SELLER_ROLE, wallet);
        } else {
            revert InvalidRole();
        }
        isKYCVerified[wallet] = true;
        entityName[wallet] = name;
        if (!_isListed[wallet]) {
            _isListed[wallet] = true;
            _entityList.push(wallet);
        }
        emit EntityRegistered(wallet, role, name);
        emit KYCStatusChanged(wallet, true);
    }

    /// @notice Cabut semua role entitas + KYC.
    function revokeEntity(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(DISTRIBUTOR_ROLE, wallet);
        _revokeRole(SELLER_ROLE, wallet);
        isKYCVerified[wallet] = false;
        emit EntityRevoked(wallet);
        emit KYCStatusChanged(wallet, false);
    }

    function setKYCStatus(address wallet, bool verified) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isKYCVerified[wallet] = verified;
        emit KYCStatusChanged(wallet, verified);
    }

    function setEntityName(address wallet, string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        entityName[wallet] = name;
    }

    // ═════════════════════ 2. Tahap 1 - Pabrik (Minting) ═════════════════════

    /// @notice Mint 1 karton yang membungkus tepat 10 itemId.
    function mintCarton(
        string calldata code,
        string calldata productName,
        string calldata batchId,
        string[] calldata itemCodes
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (itemCodes.length != ITEMS_PER_CARTON) revert InvalidItemCount();
        bytes32 ck = _key(code);
        Carton storage c = cartons[ck];
        if (c.exists) revert AlreadyExists();

        c.exists = true;
        c.mintedAt = uint64(block.timestamp);
        c.holder = msg.sender;
        c.code = code;
        c.productName = productName;
        c.batchId = batchId;
        c.trail.push(msg.sender);
        _held[msg.sender].add(ck);

        for (uint256 i = 0; i < itemCodes.length; i++) {
            bytes32 ik = _key(itemCodes[i]);
            if (items[ik].status != ItemStatus.None || cartons[ik].exists || ik == ck) revert AlreadyExists();
            items[ik].status = ItemStatus.Sealed;
            items[ik].cartonKey = ck;
            c.itemKeys.push(ik);
            emit ItemRegistered(ck, ik, itemCodes[i]);
        }
        emit CartonMinted(ck, code, productName, batchId, msg.sender);
    }

    // ═════════════════════ 3. Tahap 2 - Transit B2B (serah terima 2 langkah) ═════════════════════

    /// @notice Pemegang karton (Factory/Distributor) menandai pengiriman ke penerima terverifikasi.
    function shipCarton(string calldata code, address to) external {
        bytes32 ck = _key(code);
        Carton storage c = _carton(ck);
        if (c.holder != msg.sender) revert NotHolder();
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !_active(msg.sender, DISTRIBUTOR_ROLE)) {
            revert NotVerifiedEntity();
        }
        if (c.unpacked) revert AlreadyUnpacked();
        if (c.pendingTo != address(0)) revert ShipmentPending();
        if (c.transferCount >= MAX_TRANSFERS) revert TransferLimitReached();
        if (to == address(0) || to == msg.sender) revert InvalidAddress();

        bool toSeller = _active(to, SELLER_ROLE);
        if (!toSeller && !_active(to, DISTRIBUTOR_ROLE)) revert RecipientNotAllowed();
        // Hop terakhir harus ke Seller supaya karton tidak "macet" di distributor.
        if (c.transferCount + 1 == MAX_TRANSFERS && !toSeller) revert LastHopMustBeSeller();

        c.pendingTo = to;
        _incoming[to].add(ck);
        emit CartonShipped(ck, msg.sender, to);
    }

    function cancelShipment(string calldata code) external {
        bytes32 ck = _key(code);
        Carton storage c = _carton(ck);
        if (c.holder != msg.sender) revert NotHolder();
        address to = c.pendingTo;
        if (to == address(0)) revert NoShipmentPending();
        c.pendingTo = address(0);
        _incoming[to].remove(ck);
        emit ShipmentCancelled(ck, msg.sender, to);
    }

    /// @notice Penerima memindai QR karton lalu konfirmasi terima. Transfer count bertambah di sini.
    function receiveCarton(string calldata code) external {
        bytes32 ck = _key(code);
        Carton storage c = _carton(ck);
        if (c.pendingTo != msg.sender) revert NotRecipient();
        if (!_active(msg.sender, DISTRIBUTOR_ROLE) && !_active(msg.sender, SELLER_ROLE)) revert NotVerifiedEntity();

        address from = c.holder;
        c.holder = msg.sender;
        c.pendingTo = address(0);
        c.transferCount += 1;
        c.trail.push(msg.sender);

        _incoming[msg.sender].remove(ck);
        _held[from].remove(ck);
        _held[msg.sender].add(ck);
        emit CartonReceived(ck, from, msg.sender, c.transferCount);
    }

    // ═════════════════════ 4. Tahap 3 - Unpack oleh Seller ═════════════════════

    /// @notice Seller membongkar karton & menetapkan harga eceran. 10 item aktif + terikat ke Seller.
    function unpackCarton(string calldata code, uint256 retailPrice) external {
        if (!_active(msg.sender, SELLER_ROLE)) revert NotVerifiedEntity();
        if (retailPrice == 0) revert InvalidPrice();
        bytes32 ck = _key(code);
        Carton storage c = _carton(ck);
        if (c.holder != msg.sender) revert NotHolder();
        if (c.pendingTo != address(0)) revert ShipmentPending();
        if (c.unpacked) revert AlreadyUnpacked();

        c.unpacked = true;
        uint256 n = c.itemKeys.length;
        for (uint256 i = 0; i < n; i++) {
            Item storage it = items[c.itemKeys[i]];
            it.status = ItemStatus.Active;
            it.price = retailPrice;
            it.seller = msg.sender;
            it.activatedAt = uint64(block.timestamp);
        }
        emit CartonUnpacked(ck, msg.sender, retailPrice);
    }

    // ═════════════════════ 5. Kasir - Atomic Checkout + Once Guard ═════════════════════

    /// @notice Bayar dengan allowance yang sudah di-approve ke kontrak ini.
    function pay(string calldata itemCode) external nonReentrant {
        _settle(_key(itemCode), msg.sender);
    }

    /// @notice 1 klik: permit (tanda tangan EIP-712) + tarik USDG + kirim ke Seller + kunci REDEEMED.
    function payWithPermit(string calldata itemCode, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        bytes32 ik = _key(itemCode);
        Item storage it = items[ik];
        if (it.status == ItemStatus.Redeemed) revert AlreadyRedeemed();
        if (it.status != ItemStatus.Active) revert NotPayable(it.status);
        // try/catch: permit yang di-front-run pihak lain tidak boleh menggagalkan pembayaran.
        try IERC20Permit(address(usdg)).permit(msg.sender, address(this), it.price, deadline, v, r, s) {} catch {}
        _settle(ik, msg.sender);
    }

    function _settle(bytes32 ik, address buyer) internal {
        Item storage it = items[ik];
        if (it.status == ItemStatus.Redeemed) revert AlreadyRedeemed();
        if (it.status != ItemStatus.Active) revert NotPayable(it.status);

        uint256 price = it.price;
        address seller = it.seller;

        // Effects dulu (Once Guard lock), baru interaksi eksternal.
        it.status = ItemStatus.Redeemed;
        it.redeemedAt = uint64(block.timestamp);
        it.redeemedBy = buyer;

        usdg.safeTransferFrom(buyer, seller, price); // tarik dari konsumen -> langsung ke Seller
        emit ItemRedeemed(ik, it.cartonKey, buyer, seller, price);
    }

    // ═════════════════════ Views ═════════════════════

    function roleOf(address account) public view returns (Role) {
        if (hasRole(DEFAULT_ADMIN_ROLE, account)) return Role.Factory;
        if (!isKYCVerified[account]) return Role.None;
        if (hasRole(DISTRIBUTOR_ROLE, account)) return Role.Distributor;
        if (hasRole(SELLER_ROLE, account)) return Role.Seller;
        return Role.None;
    }

    function getItemProof(string calldata itemCode) external view returns (ItemProof memory p) {
        Item storage it = items[_key(itemCode)];
        p.status = it.status;
        if (it.status == ItemStatus.None) return p;

        Carton storage c = cartons[it.cartonKey];
        p.cartonCode = c.code;
        p.productName = c.productName;
        p.batchId = c.batchId;
        p.trail = c.trail;
        p.trailNames = _names(c.trail);
        p.price = it.price;
        p.seller = it.seller;
        p.sellerName = entityName[it.seller];
        p.redeemedAt = it.redeemedAt;
        p.redeemedBy = it.redeemedBy;
    }

    function getCarton(string calldata code) external view returns (CartonView memory v) {
        Carton storage c = cartons[_key(code)];
        if (!c.exists) return v;
        v.exists = true;
        v.unpacked = c.unpacked;
        v.transferCount = c.transferCount;
        v.mintedAt = c.mintedAt;
        v.holder = c.holder;
        v.pendingTo = c.pendingTo;
        v.code = c.code;
        v.productName = c.productName;
        v.batchId = c.batchId;
        v.trail = c.trail;
        v.trailNames = _names(c.trail);
    }

    function heldCartonCodes(address account) external view returns (string[] memory) {
        return _codes(_held[account]);
    }

    function incomingCartonCodes(address account) external view returns (string[] memory) {
        return _codes(_incoming[account]);
    }

    function listEntities() external view returns (EntityView[] memory out) {
        uint256 n = _entityList.length;
        out = new EntityView[](n);
        for (uint256 i = 0; i < n; i++) {
            address w = _entityList[i];
            Role r = hasRole(DISTRIBUTOR_ROLE, w) ? Role.Distributor : (hasRole(SELLER_ROLE, w) ? Role.Seller : Role.None);
            out[i] = EntityView(w, r, isKYCVerified[w], entityName[w]);
        }
    }

    // ═════════════════════ Internal ═════════════════════

    function _key(string calldata id) internal pure returns (bytes32) {
        uint256 len = bytes(id).length;
        if (len == 0 || len > MAX_ID_LENGTH) revert InvalidId();
        return keccak256(bytes(id));
    }

    function _carton(bytes32 ck) internal view returns (Carton storage c) {
        c = cartons[ck];
        if (!c.exists) revert NotFound();
    }

    function _active(address account, bytes32 role) internal view returns (bool) {
        return hasRole(role, account) && isKYCVerified[account];
    }

    function _names(address[] storage list) internal view returns (string[] memory out) {
        out = new string[](list.length);
        for (uint256 i = 0; i < list.length; i++) out[i] = entityName[list[i]];
    }

    function _codes(EnumerableSet.Bytes32Set storage set) internal view returns (string[] memory out) {
        uint256 n = set.length();
        out = new string[](n);
        for (uint256 i = 0; i < n; i++) out[i] = cartons[set.at(i)].code;
    }
}

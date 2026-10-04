// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDG
/// @notice Tiruan Paxos USDG untuk testnet: 6 desimal + ERC-2612 permit + faucet.
/// @dev HANYA UNTUK TESTNET. Di produksi ganti dengan alamat USDG asli (ChainSeal bertipe IERC20).
contract MockUSDG is ERC20, ERC20Permit, Ownable {
    uint256 public constant FAUCET_AMOUNT = 100e6; // $100.00
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastClaimAt;

    event FaucetClaimed(address indexed to, uint256 amount);

    error FaucetCooldown(uint256 availableAt);

    constructor(address initialOwner)
        ERC20("Mock Global Dollar", "USDG")
        ERC20Permit("Mock Global Dollar")
        Ownable(initialOwner)
    {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Tombol "Dapatkan $100 (Faucet)" di profil konsumen.
    function claimFaucet() external {
        uint256 last = lastClaimAt[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(last + FAUCET_COOLDOWN);
        }
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Mint bebas oleh owner (untuk seeding demo).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

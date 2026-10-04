import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const ROLE = { None: 0, Factory: 1, Distributor: 2, Seller: 3 };
const STATUS = { None: 0, Sealed: 1, Active: 2, Redeemed: 3 };
const USD = (n: number) => BigInt(Math.round(n * 1e6));
const itemCodes = (n: string) => Array.from({ length: 10 }, (_, i) => `ITEM-${n}-${String(i + 1).padStart(2, "0")}`);

async function permitSig(usdg: any, owner: any, spender: string, value: bigint, deadline: number) {
  const { chainId } = await ethers.provider.getNetwork();
  const sig = await owner.signTypedData(
    { name: await usdg.name(), version: "1", chainId, verifyingContract: await usdg.getAddress() },
    {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { owner: owner.address, spender, value, nonce: await usdg.nonces(owner.address), deadline }
  );
  return ethers.Signature.from(sig);
}

describe("ChainSeal OG", () => {
  async function deploy() {
    const [factory, dist1, dist2, dist3, dist4, seller, consumer, stranger, ...rest] = await ethers.getSigners();
    const usdg = await (await ethers.getContractFactory("MockUSDG")).deploy(factory.address);
    const seal = await (await ethers.getContractFactory("ChainSeal")).deploy(await usdg.getAddress(), "Pabrik Demo");
    await seal.registerEntity(dist1.address, ROLE.Distributor, "Distributor 1");
    await seal.registerEntity(dist2.address, ROLE.Distributor, "Distributor 2");
    await seal.registerEntity(dist3.address, ROLE.Distributor, "Distributor 3");
    await seal.registerEntity(dist4.address, ROLE.Distributor, "Distributor 4");
    await seal.registerEntity(seller.address, ROLE.Seller, "Toko X");
    await seal.mintCarton("KARTON-101", "Sirup Demo 100ml", "BATCH-A1", itemCodes("101"));
    return { usdg, seal, factory, dist1, dist2, dist3, dist4, seller, consumer, stranger, rest };
  }

  async function unpackedFixture() {
    const f = await deploy();
    await f.seal.shipCarton("KARTON-101", f.dist1.address);
    await f.seal.connect(f.dist1).receiveCarton("KARTON-101");
    await f.seal.connect(f.dist1).shipCarton("KARTON-101", f.seller.address);
    await f.seal.connect(f.seller).receiveCarton("KARTON-101");
    await f.seal.connect(f.seller).unpackCarton("KARTON-101", USD(5));
    await f.usdg.connect(f.consumer).claimFaucet();
    return f;
  }

  describe("RBAC + KYC", () => {
    it("deployer = Factory; entitas terdaftar otomatis KYC true", async () => {
      const { seal, factory, dist1, seller, stranger } = await loadFixture(deploy);
      expect(await seal.roleOf(factory.address)).to.equal(ROLE.Factory);
      expect(await seal.roleOf(dist1.address)).to.equal(ROLE.Distributor);
      expect(await seal.roleOf(seller.address)).to.equal(ROLE.Seller);
      expect(await seal.isKYCVerified(seller.address)).to.equal(true);
      expect(await seal.roleOf(stranger.address)).to.equal(ROLE.None);
    });

    it("hanya admin yang boleh mendaftarkan / mint", async () => {
      const { seal, stranger } = await loadFixture(deploy);
      await expect(seal.connect(stranger).registerEntity(stranger.address, ROLE.Seller, "x")).to.be.reverted;
      await expect(seal.connect(stranger).mintCarton("KARTON-X", "p", "b", itemCodes("X"))).to.be.reverted;
    });

    it("role tanpa KYC tidak aktif; revoke mencabut akses", async () => {
      const { seal, dist1 } = await loadFixture(deploy);
      await seal.setKYCStatus(dist1.address, false);
      expect(await seal.roleOf(dist1.address)).to.equal(ROLE.None);
      await seal.setKYCStatus(dist1.address, true);
      await seal.revokeEntity(dist1.address);
      expect(await seal.roleOf(dist1.address)).to.equal(ROLE.None);
    });

    it("listEntities mengembalikan entitas terdaftar", async () => {
      const { seal } = await loadFixture(deploy);
      const list = await seal.listEntities();
      expect(list.length).to.equal(5);
      expect(list[4].name).to.equal("Toko X");
    });
  });

  describe("Minting", () => {
    it("mint karton berisi 10 item (status Sealed)", async () => {
      const { seal, factory } = await loadFixture(deploy);
      const c = await seal.getCarton("KARTON-101");
      expect(c.exists).to.equal(true);
      expect(c.holder).to.equal(factory.address);
      expect((await seal.getItemProof("ITEM-101-01")).status).to.equal(STATUS.Sealed);
      expect(await seal.heldCartonCodes(factory.address)).to.deep.equal(["KARTON-101"]);
    });

    it("menolak jumlah item != 10, karton duplikat, item duplikat", async () => {
      const { seal } = await loadFixture(deploy);
      await expect(seal.mintCarton("KARTON-102", "p", "b", itemCodes("102").slice(0, 9))).to.be.revertedWithCustomError(seal, "InvalidItemCount");
      await expect(seal.mintCarton("KARTON-101", "p", "b", itemCodes("999"))).to.be.revertedWithCustomError(seal, "AlreadyExists");
      await expect(seal.mintCarton("KARTON-103", "p", "b", itemCodes("101"))).to.be.revertedWithCustomError(seal, "AlreadyExists");
    });
  });

  describe("Transit B2B", () => {
    it("serah terima 2 langkah memperbarui kustodi, jejak, dan transferCount", async () => {
      const { seal, factory, dist1 } = await loadFixture(deploy);
      await seal.shipCarton("KARTON-101", dist1.address);
      expect(await seal.incomingCartonCodes(dist1.address)).to.deep.equal(["KARTON-101"]);
      await seal.connect(dist1).receiveCarton("KARTON-101");
      const c = await seal.getCarton("KARTON-101");
      expect(c.holder).to.equal(dist1.address);
      expect(c.transferCount).to.equal(1);
      expect(c.trailNames).to.deep.equal(["Pabrik Demo", "Distributor 1"]);
      expect(await seal.heldCartonCodes(factory.address)).to.deep.equal([]);
    });

    it("hanya penerima yang dituju yang bisa menerima; pengiriman bisa dibatalkan", async () => {
      const { seal, dist1, dist2 } = await loadFixture(deploy);
      await seal.shipCarton("KARTON-101", dist1.address);
      await expect(seal.connect(dist2).receiveCarton("KARTON-101")).to.be.revertedWithCustomError(seal, "NotRecipient");
      await seal.cancelShipment("KARTON-101");
      await expect(seal.connect(dist1).receiveCarton("KARTON-101")).to.be.revertedWithCustomError(seal, "NotRecipient");
    });

    it("menolak kirim ke wallet non-KYC / tak terdaftar, dan oleh non-pemegang", async () => {
      const { seal, stranger, dist1 } = await loadFixture(deploy);
      await expect(seal.shipCarton("KARTON-101", stranger.address)).to.be.revertedWithCustomError(seal, "RecipientNotAllowed");
      await expect(seal.connect(dist1).shipCarton("KARTON-101", dist1.address)).to.be.revertedWithCustomError(seal, "NotHolder");
    });

    it("batas 5 perpindahan: hop terakhir wajib ke Seller", async () => {
      const { seal, dist1, dist2, dist3, dist4, seller } = await loadFixture(deploy);
      const hops = [dist1, dist2, dist3, dist4];
      await seal.shipCarton("KARTON-101", dist1.address);
      await seal.connect(dist1).receiveCarton("KARTON-101");
      for (let i = 1; i < 4; i++) {
        await seal.connect(hops[i - 1]).shipCarton("KARTON-101", hops[i].address);
        await seal.connect(hops[i]).receiveCarton("KARTON-101");
      }
      expect((await seal.getCarton("KARTON-101")).transferCount).to.equal(4);
      await expect(seal.connect(dist4).shipCarton("KARTON-101", dist1.address)).to.be.revertedWithCustomError(seal, "LastHopMustBeSeller");
      await seal.connect(dist4).shipCarton("KARTON-101", seller.address);
      await seal.connect(seller).receiveCarton("KARTON-101");
      expect((await seal.getCarton("KARTON-101")).transferCount).to.equal(5);
    });
  });

  describe("Unpack", () => {
    it("hanya Seller pemegang karton; semua item aktif dengan harga + penerima uang", async () => {
      const { seal, dist1, seller } = await loadFixture(deploy);
      await seal.shipCarton("KARTON-101", seller.address);
      await expect(seal.connect(seller).unpackCarton("KARTON-101", USD(5))).to.be.revertedWithCustomError(seal, "NotHolder");
      await seal.connect(seller).receiveCarton("KARTON-101");
      await expect(seal.connect(dist1).unpackCarton("KARTON-101", USD(5))).to.be.revertedWithCustomError(seal, "NotVerifiedEntity");
      await expect(seal.connect(seller).unpackCarton("KARTON-101", 0)).to.be.revertedWithCustomError(seal, "InvalidPrice");
      await seal.connect(seller).unpackCarton("KARTON-101", USD(5));
      const p = await seal.getItemProof("ITEM-101-07");
      expect(p.status).to.equal(STATUS.Active);
      expect(p.price).to.equal(USD(5));
      expect(p.seller).to.equal(seller.address);
      expect(p.sellerName).to.equal("Toko X");
      await expect(seal.connect(seller).unpackCarton("KARTON-101", USD(5))).to.be.revertedWithCustomError(seal, "AlreadyUnpacked");
    });
  });

  describe("Checkout atomik + Once Guard", () => {
    it("payWithPermit: tarik dari konsumen, kirim ke Seller, kunci REDEEMED", async () => {
      const { seal, usdg, consumer, seller } = await loadFixture(unpackedFixture);
      const deadline = (await time.latest()) + 3600;
      const sig = await permitSig(usdg, consumer, await seal.getAddress(), USD(5), deadline);
      await expect(seal.connect(consumer).payWithPermit("ITEM-101-01", deadline, sig.v, sig.r, sig.s))
        .to.emit(seal, "ItemRedeemed");
      expect(await usdg.balanceOf(consumer.address)).to.equal(USD(95));
      expect(await usdg.balanceOf(seller.address)).to.equal(USD(5));
      const p = await seal.getItemProof("ITEM-101-01");
      expect(p.status).to.equal(STATUS.Redeemed);
      expect(p.redeemedBy).to.equal(consumer.address);
    });

    it("anti-pemalsuan: scan ulang item yang sudah REDEEMED ditolak", async () => {
      const { seal, usdg, consumer, stranger } = await loadFixture(unpackedFixture);
      await usdg.connect(consumer).approve(await seal.getAddress(), USD(50));
      await seal.connect(consumer).pay("ITEM-101-02");
      await usdg.connect(stranger).claimFaucet();
      await usdg.connect(stranger).approve(await seal.getAddress(), USD(50));
      await expect(seal.connect(stranger).pay("ITEM-101-02")).to.be.revertedWithCustomError(seal, "AlreadyRedeemed");
      expect((await seal.getItemProof("ITEM-101-02")).status).to.equal(STATUS.Redeemed);
    });

    it("tetap sukses walau permit di-front-run (allowance sudah ada)", async () => {
      const { seal, usdg, consumer } = await loadFixture(unpackedFixture);
      const deadline = (await time.latest()) + 3600;
      const sig = await permitSig(usdg, consumer, await seal.getAddress(), USD(5), deadline);
      await usdg.permit(consumer.address, await seal.getAddress(), USD(5), deadline, sig.v, sig.r, sig.s); // pihak ketiga
      await seal.connect(consumer).payWithPermit("ITEM-101-03", deadline, sig.v, sig.r, sig.s);
      expect((await seal.getItemProof("ITEM-101-03")).status).to.equal(STATUS.Redeemed);
    });

    it("item tak terdaftar / belum di-unpack tidak bisa dibayar", async () => {
      const { seal, consumer } = await loadFixture(deploy);
      expect((await seal.getItemProof("ITEM-PALSU-1")).status).to.equal(STATUS.None);
      await expect(seal.connect(consumer).pay("ITEM-PALSU-1")).to.be.revertedWithCustomError(seal, "NotPayable");
      await expect(seal.connect(consumer).pay("ITEM-101-01")).to.be.revertedWithCustomError(seal, "NotPayable");
    });

    it("saldo tidak cukup -> seluruh transaksi revert, status tetap Active (atomik)", async () => {
      const { seal, usdg, stranger } = await loadFixture(unpackedFixture);
      await usdg.connect(stranger).approve(await seal.getAddress(), USD(5));
      await expect(seal.connect(stranger).pay("ITEM-101-04")).to.be.reverted;
      expect((await seal.getItemProof("ITEM-101-04")).status).to.equal(STATUS.Active);
    });
  });

  describe("MockUSDG faucet", () => {
    it("memberi $100 dan menerapkan cooldown", async () => {
      const { usdg, stranger } = await loadFixture(deploy);
      await usdg.connect(stranger).claimFaucet();
      expect(await usdg.balanceOf(stranger.address)).to.equal(USD(100));
      await expect(usdg.connect(stranger).claimFaucet()).to.be.revertedWithCustomError(usdg, "FaucetCooldown");
      await time.increase(3601);
      await usdg.connect(stranger).claimFaucet();
      expect(await usdg.balanceOf(stranger.address)).to.equal(USD(200));
    });
  });
});

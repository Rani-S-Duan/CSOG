import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Siapkan data demo: daftarkan Distributor/Seller (dari .env) + mint KARTON-101..103.
 *   npm run seed:sepolia
 */
const ROLE = { Distributor: 2, Seller: 3 };

async function main() {
  const file = path.resolve(__dirname, "..", "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Belum ada deployment untuk ${network.name}. Jalankan deploy dulu.`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const seal = await ethers.getContractAt("ChainSeal", d.chainSeal);

  const dist = process.env.DEMO_DISTRIBUTOR;
  const sell = process.env.DEMO_SELLER;
  if (dist && ethers.isAddress(dist)) {
    await (await seal.registerEntity(dist, ROLE.Distributor, "Distributor Demo")).wait();
    console.log("Distributor terdaftar:", dist);
  }
  if (sell && ethers.isAddress(sell)) {
    await (await seal.registerEntity(sell, ROLE.Seller, "Toko Demo")).wait();
    console.log("Seller terdaftar     :", sell);
  }

  for (const n of ["101", "102", "103"]) {
    const code = `KARTON-${n}`;
    const items = Array.from({ length: 10 }, (_, i) => `ITEM-${n}-${String(i + 1).padStart(2, "0")}`);
    try {
      await (await seal.mintCarton(code, "Sirup Batuk Demo 100ml", `BATCH-2026-${n}`, items)).wait();
      console.log(`Minted ${code} (${items[0]} .. ${items[9]})`);
    } catch (e: any) {
      console.log(`Lewati ${code}:`, e.shortMessage ?? e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

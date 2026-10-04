import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** Verifikasi source di Arbiscan (butuh ARBISCAN_API_KEY). */
async function main() {
  const file = path.resolve(__dirname, "..", "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const factoryName = process.env.FACTORY_NAME || "ChainSeal Factory";

  await run("verify:verify", { address: d.usdg, constructorArguments: [d.deployer] }).catch((e) => console.log("MockUSDG:", e.message));
  await run("verify:verify", { address: d.chainSeal, constructorArguments: [d.usdg, factoryName] }).catch((e) => console.log("ChainSeal:", e.message));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

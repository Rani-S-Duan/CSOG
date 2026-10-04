import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy MockUSDG + ChainSeal, simpan alamat, dan ekspor ABI + alamat ke ../web/src/contracts.
 *   npm run deploy:sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY belum diisi di .env");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network   : ${network.name} (chainId ${chainId})`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Saldo ETH : ${ethers.formatEther(balance)}`);
  if (balance === 0n) throw new Error("Saldo ETH 0. Ambil faucet Arbitrum Sepolia dulu.");

  const usdg = await (await ethers.getContractFactory("MockUSDG")).deploy(deployer.address);
  await usdg.waitForDeployment();
  const usdgAddress = await usdg.getAddress();
  console.log(`MockUSDG  : ${usdgAddress}`);

  const factoryName = process.env.FACTORY_NAME || "ChainSeal Factory";
  const seal = await (await ethers.getContractFactory("ChainSeal")).deploy(usdgAddress, factoryName);
  const receipt = await seal.deploymentTransaction()!.wait();
  await seal.waitForDeployment();
  const sealAddress = await seal.getAddress();
  console.log(`ChainSeal : ${sealAddress}`);

  // Opsional: beri admin kedua (wallet Privy "Login with Google" milik Pabrik).
  const extraAdmin = process.env.FACTORY_ADMIN_ADDRESS;
  if (extraAdmin && ethers.isAddress(extraAdmin)) {
    const adminRole = await seal.DEFAULT_ADMIN_ROLE();
    await (await seal.grantRole(adminRole, extraAdmin)).wait();
    await (await seal.setEntityName(extraAdmin, factoryName)).wait();
    console.log(`Admin tambahan: ${extraAdmin}`);
  }

  const deployment = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    usdg: usdgAddress,
    chainSeal: sealAddress,
    deployBlock: receipt?.blockNumber ?? 0,
    deployedAt: new Date().toISOString(),
  };

  const root = path.resolve(__dirname, "..", "..");
  fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments", `${network.name}.json`), JSON.stringify(deployment, null, 2));

  const webDir = path.join(root, "web", "src", "contracts");
  fs.mkdirSync(webDir, { recursive: true });
  const sealArt = await artifacts.readArtifact("ChainSeal");
  const usdgArt = await artifacts.readArtifact("MockUSDG");
  fs.writeFileSync(path.join(webDir, "ChainSeal.abi.json"), JSON.stringify(sealArt.abi, null, 2));
  fs.writeFileSync(path.join(webDir, "MockUSDG.abi.json"), JSON.stringify(usdgArt.abi, null, 2));
  if (network.name !== "hardhat") {
    fs.writeFileSync(path.join(webDir, "deployment.json"), JSON.stringify(deployment, null, 2));
    console.log("Frontend config diperbarui: web/src/contracts/deployment.json");
  }

  if (network.name === "arbitrumSepolia") {
    console.log(`\nArbiscan: https://sepolia.arbiscan.io/address/${sealAddress}`);
    console.log("Verifikasi source: npm run verify:sepolia");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

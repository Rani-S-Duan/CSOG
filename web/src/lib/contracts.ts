import type { Abi, Address } from "viem";
import deployment from "@/contracts/deployment.json";
import chainSealAbi from "@/contracts/ChainSeal.abi.json";
import usdgAbi from "@/contracts/MockUSDG.abi.json";

export const ZERO: Address = "0x0000000000000000000000000000000000000000";

export const CHAINSEAL = {
  address: deployment.chainSeal as Address,
  abi: chainSealAbi as Abi,
} as const;

export const USDG = {
  address: deployment.usdg as Address,
  abi: usdgAbi as Abi,
} as const;

export const USDG_DECIMALS = 6;
export const isDeployed = deployment.chainSeal !== ZERO;

// Enum mirror dari ChainSeal.sol
export enum Role {
  None = 0,
  Factory = 1,
  Distributor = 2,
  Seller = 3,
}
export enum ItemStatus {
  None = 0,
  Sealed = 1,
  Active = 2,
  Redeemed = 3,
}

export type CartonView = {
  exists: boolean;
  unpacked: boolean;
  transferCount: number;
  mintedAt: bigint;
  holder: Address;
  pendingTo: Address;
  code: string;
  productName: string;
  batchId: string;
  trail: Address[];
  trailNames: string[];
};

export type ItemProof = {
  status: number;
  cartonCode: string;
  productName: string;
  batchId: string;
  trail: Address[];
  trailNames: string[];
  price: bigint;
  seller: Address;
  sellerName: string;
  redeemedAt: bigint;
  redeemedBy: Address;
};

export type EntityView = { wallet: Address; role: number; kyc: boolean; name: string };

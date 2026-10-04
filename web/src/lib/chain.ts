import { createPublicClient, http } from "viem";
import { arbitrumSepolia } from "viem/chains";

export const CHAIN = arbitrumSepolia; // chainId 421614
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
export const EXPLORER = "https://sepolia.arbiscan.io";

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL),
});

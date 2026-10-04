"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BaseError, ContractFunctionRevertedError, createWalletClient, custom } from "viem";
import type { Abi, Address, WalletClient } from "viem";
import { CHAIN, publicClient } from "./chain";

export type WalletCtx = { address: Address; walletClient: WalletClient };

/** Pesan error kontrak -> bahasa pengguna. */
const ERROR_TEXT: Record<string, string> = {
  AlreadyRedeemed: "ALREADY REDEEMED. This package has already been paid for.",
  NotPayable: "This item is not active for sale (carton not unpacked yet, or not registered).",
  NotHolder: "You are not the current holder of this carton.",
  NotRecipient: "This carton is not addressed to your wallet.",
  NotVerifiedEntity: "Your wallet is not registered or KYC-verified for this action.",
  RecipientNotAllowed: "The recipient must be a verified Distributor or Seller.",
  LastHopMustBeSeller: "The last (5th) transfer must go to a Seller.",
  TransferLimitReached: "The 5-transfer limit for this carton has been reached.",
  ShipmentPending: "This carton is already in transit. Cancel the shipment or wait for it to be received.",
  NoShipmentPending: "There is no shipment in progress.",
  AlreadyUnpacked: "This carton has already been unpacked.",
  AlreadyExists: "This ID is already registered. Use a different ID.",
  NotFound: "Carton not found.",
  InvalidItemCount: "A carton must contain exactly 10 items.",
  InvalidPrice: "Price must be greater than 0.",
  InvalidId: "Invalid ID (1-64 characters).",
  FaucetCooldown: "The faucet can be claimed again after 1 hour.",
  ERC20InsufficientBalance: "Insufficient USDG balance. Claim the faucet first.",
  ERC20InsufficientAllowance: "Insufficient USDG allowance.",
  AccessControlUnauthorizedAccount: "This wallet is not the Admin/Factory.",
};

export function humanizeError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && ERROR_TEXT[name]) return ERROR_TEXT[name];
    if (name) return `Transaction rejected by contract: ${name}`;
    if (/user rejected|denied/i.test(e.shortMessage)) return "Transaction cancelled.";
    if (/insufficient funds/i.test(e.message)) return "Out of ETH for gas. Reload the page to request starter gas.";
    return e.shortMessage || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

type WriteParams = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/** Simulasi dulu (error terbaca jelas) -> kirim -> tunggu receipt. */
export async function sendTx(ctx: WalletCtx, params: WriteParams): Promise<`0x${string}`> {
  const { request } = await publicClient.simulateContract({ ...params, account: ctx.address });
  const hash = await ctx.walletClient.writeContract({ ...request, account: ctx.address, chain: CHAIN });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction failed on-chain.");
  return hash;
}

/** Menyiapkan wallet viem dari wallet Privy (embedded Google / MetaMask) + gas awal. */
export function useWalletCtx() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [ctx, setCtx] = useState<WalletCtx | null>(null);

  const target = authenticated
    ? (wallets.find((w) => w.address.toLowerCase() === user?.wallet?.address?.toLowerCase()) ?? wallets[0])
    : undefined;
  const targetAddress = target?.address;

  useEffect(() => {
    let cancelled = false;
    if (!target) {
      setCtx(null);
      return;
    }
    (async () => {
      try {
        await target.switchChain(CHAIN.id);
        const provider = await target.getEthereumProvider();
        if (cancelled) return;
        const walletClient = createWalletClient({
          account: target.address as Address,
          chain: CHAIN,
          transport: custom(provider),
        });
        setCtx({ address: target.address as Address, walletClient });

        // Gas awal untuk wallet baru (server hanya mengirim jika saldo ETH hampir habis).
        const token = await getAccessToken();
        if (token) {
          fetch("/api/gas-drip", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ address: target.address }),
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Failed to set up wallet", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAddress]);

  return { ready, authenticated, ctx, email: user?.email?.address ?? user?.google?.email };
}

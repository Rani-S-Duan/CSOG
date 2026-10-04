"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { publicClient } from "@/lib/chain";
import { CHAINSEAL, Role, USDG, isDeployed } from "@/lib/contracts";
import { fmtUsd, shortAddr } from "@/lib/format";
import { humanizeError, sendTx, type WalletCtx } from "@/lib/wallet";
import { Notice } from "./ui";

const ROLE_LABEL: Record<number, string> = {
  [Role.None]: "Consumer",
  [Role.Factory]: "Factory",
  [Role.Distributor]: "Distributor",
  [Role.Seller]: "Seller",
};

/** Header + profil: alamat wallet (untuk didaftarkan Pabrik), saldo gaya dompet digital, faucet. */
export default function Header({
  ctx,
  role,
  email,
  balanceVersion,
}: {
  ctx: WalletCtx;
  role: number;
  email?: string;
  balanceVersion: number;
}) {
  const { logout } = usePrivy();
  const [balance, setBalance] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!isDeployed) return;
    const b = (await publicClient.readContract({ ...USDG, functionName: "balanceOf", args: [ctx.address] })) as bigint;
    setBalance(b);
  }, [ctx.address]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh, balanceVersion]);

  const claim = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sendTx(ctx, { ...USDG, functionName: "claimFaucet" });
      await refresh();
      setMsg({ kind: "ok", text: "Balance increased by $100.00" });
    } catch (e) {
      setMsg({ kind: "error", text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="neon-box mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-400">{ROLE_LABEL[role] ?? "Consumer"}</p>
          <p className="text-2xl font-bold text-white">Balance: {fmtUsd(balance)}</p>
        </div>
        <button type="button" className="btn-neon" onClick={() => logout()}>
          Log out
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
        {email && <span>{email}</span>}
        <button
          type="button"
          className="font-mono text-cyan-400 underline decoration-dotted"
          onClick={() => {
            navigator.clipboard.writeText(ctx.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy wallet address"
        >
          {shortAddr(ctx.address)}
        </button>
        <span className="text-xs text-zinc-500">{copied ? "Copied" : "tap to copy"}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-neon" onClick={claim} disabled={busy || !isDeployed}>
          {busy ? "Processing…" : "Get $100 (Faucet)"}
        </button>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>
    </header>
  );
}

export { CHAINSEAL };

"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { parseScan } from "@/lib/links";
import { parseSignature, type Address } from "viem";
import { CHAIN, EXPLORER, publicClient } from "@/lib/chain";
import { CHAINSEAL, ItemStatus, USDG, isDeployed, type ItemProof } from "@/lib/contracts";
import { isItemId } from "@/lib/ids";
import { fmtTime, fmtUsd, shortAddr } from "@/lib/format";
import { humanizeError, sendTx, type WalletCtx } from "@/lib/wallet";
import ScanOrType from "./ScanOrType";
import { NeonBox, Notice, Title, Trail } from "./ui";

const rejected = (e: unknown) => /user rejected|user denied|rejected the request|denied/i.test(e instanceof Error ? e.message : String(e));

/**
 * Tampilan konsumen (mobile first): scan ItemID -> cek on-chain -> bayar atomik.
 * ctx = null -> mode cek keaslian saja (tanpa login).
 */
export default function ConsumerView({ ctx, onPaid }: { ctx: WalletCtx | null; onPaid?: () => void }) {
  const [itemId, setItemId] = useState("");
  const [proof, setProof] = useState<ItemProof | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paidTx, setPaidTx] = useState<{ id: string; hash: string } | null>(null);

  const check = async (id: string) => {
    setError("");
    setProof(null);
    if (!isItemId(id)) {
      setError("This is not an item QR. Item IDs start with ITEM-.");
      return;
    }
    if (!isDeployed) {
      setError("Contracts are not deployed. Run the deploy and fill in deployment.json.");
      return;
    }
    setLoading(true);
    try {
      const p = (await publicClient.readContract({ ...CHAINSEAL, functionName: "getItemProof", args: [id] })) as unknown as ItemProof;
      setItemId(id);
      setProof(p);
      try {
        sessionStorage.setItem("chainseal:item", id);
      } catch {}
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setLoading(false);
    }
  };

  const pay = async () => {
    if (!ctx || !proof) return;
    setBusy(true);
    setError("");
    try {
      const balance = (await publicClient.readContract({ ...USDG, functionName: "balanceOf", args: [ctx.address] })) as bigint;
      if (balance < proof.price) throw new Error("Insufficient balance. Tap “Get $100 (Faucet)” above.");

      // Jalur 1 klik: tanda tangan permit (EIP-712) + payWithPermit.
      let sig: ReturnType<typeof parseSignature> | null = null;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      try {
        const [nonce, name] = await Promise.all([
          publicClient.readContract({ ...USDG, functionName: "nonces", args: [ctx.address] }) as Promise<bigint>,
          publicClient.readContract({ ...USDG, functionName: "name" }) as Promise<string>,
        ]);
        const signature = await ctx.walletClient.signTypedData({
          account: ctx.address,
          domain: { name, version: "1", chainId: CHAIN.id, verifyingContract: USDG.address },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Permit",
          message: { owner: ctx.address, spender: CHAINSEAL.address, value: proof.price, nonce, deadline },
        });
        sig = parseSignature(signature);
      } catch (e) {
        if (rejected(e)) throw e;
        sig = null; // wallet tidak mendukung typed data -> jalur approve + pay
      }

      let hash: `0x${string}`;
      if (sig) {
        const v = Number(sig.v ?? 27n + BigInt(sig.yParity ?? 0));
        hash = await sendTx(ctx, { ...CHAINSEAL, functionName: "payWithPermit", args: [itemId, deadline, v, sig.r, sig.s] });
      } else {
        const allowance = (await publicClient.readContract({ ...USDG, functionName: "allowance", args: [ctx.address, CHAINSEAL.address as Address] })) as bigint;
        if (allowance < proof.price) await sendTx(ctx, { ...USDG, functionName: "approve", args: [CHAINSEAL.address, proof.price] });
        hash = await sendTx(ctx, { ...CHAINSEAL, functionName: "pay", args: [itemId] });
      }
      setPaidTx({ id: itemId, hash });
      onPaid?.();
      await check(itemId);
    } catch (e) {
      setError(e instanceof Error && !("shortMessage" in e) ? e.message : humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const { login } = usePrivy();

  // Buka dari QR (?item=ID): langsung cek. ID disimpan agar tetap ada setelah redirect login.
  useEffect(() => {
    let id = "";
    try {
      const p = new URLSearchParams(window.location.search).get("item");
      id = p ? parseScan(p) : (sessionStorage.getItem("chainseal:item") ?? "");
    } catch {}
    if (id) check(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const justPaid = paidTx && paidTx.id === itemId;

  return (
    <div className="space-y-4">
      <NeonBox>
        <Title>Verify authenticity & pay</Title>
        <ScanOrType placeholder="" onId={check} buttonLabel="Check" allowManual={false} />
      </NeonBox>

      {loading && <Notice kind="info">Checking the blockchain…</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {proof && proof.status === ItemStatus.None && (
        <NeonBox tone="red">
          <p role="alert" className="text-xl font-bold text-red-400">NOT REGISTERED</p>
          <p className="mt-1 text-white">{itemId} is not in the factory records. This is most likely counterfeit.</p>
        </NeonBox>
      )}

      {proof && proof.status === ItemStatus.Sealed && (
        <NeonBox tone="amber">
          <p className="text-xl font-bold text-amber-300">NOT ACTIVATED YET</p>
          <p className="mt-1 text-white">
            This item is registered ({proof.productName}) but its carton has not been unpacked by a shop yet, so it must not be sold at retail.
          </p>
        </NeonBox>
      )}

      {proof && proof.status === ItemStatus.Active && (
        <NeonBox tone="green">
          <p className="text-xl font-bold text-emerald-300">GENUINE PRODUCT</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-zinc-400">Product</dt>
            <dd className="text-white">{proof.productName}</dd>
            <dt className="text-zinc-400">Batch</dt>
            <dd className="text-white">{proof.batchId}</dd>
            <dt className="text-zinc-400">Item ID</dt>
            <dd className="font-mono text-white">{itemId}</dd>
            <dt className="text-zinc-400">Carton</dt>
            <dd className="font-mono text-white">{proof.cartonCode}</dd>
            <dt className="text-zinc-400">Price</dt>
            <dd className="text-2xl font-bold text-white">{fmtUsd(proof.price)}</dd>
            <dt className="text-zinc-400">Payee</dt>
            <dd className="text-white">{proof.sellerName || shortAddr(proof.seller)}</dd>
          </dl>
          <p className="mb-1 mt-3 text-sm text-zinc-400">History from factory to shop</p>
          <Trail names={proof.trailNames} />
          {ctx ? (
            <button type="button" className="btn-neon mt-4 w-full !border-emerald-400 !text-emerald-300 !shadow-[0_0_10px_#34d399] hover:!bg-emerald-400 hover:!text-black" disabled={busy} onClick={pay}>
              {busy ? "Processing payment…" : `Pay ${fmtUsd(proof.price)}`}
            </button>
          ) : (
            <button type="button" className="btn-neon mt-4 w-full" onClick={() => login()}>
              Sign in to pay {fmtUsd(proof.price)}
            </button>
          )}
        </NeonBox>
      )}

      {proof && proof.status === ItemStatus.Redeemed && justPaid && (
        <NeonBox tone="green">
          <p role="status" className="text-xl font-bold text-emerald-300">PAYMENT SUCCESSFUL</p>
          <p className="mt-1 text-white">
            {fmtUsd(proof.price)} sent to {proof.sellerName || shortAddr(proof.seller)}. This package is now locked (REDEEMED).
          </p>
          <a className="mt-2 inline-block text-sm text-cyan-400 underline" href={`${EXPLORER}/tx/${paidTx.hash}`} target="_blank" rel="noreferrer">
            View transaction on Arbiscan
          </a>
        </NeonBox>
      )}

      {proof && proof.status === ItemStatus.Redeemed && !justPaid && (
        <NeonBox tone="red" className="py-8 text-center">
          <p role="alert" className="text-2xl font-extrabold leading-tight text-red-400">
            ALREADY REDEEMED
            <br />
            THIS IS PROBABLY USED OR COUNTERFEIT
          </p>
          <p className="mt-3 text-sm text-white">
            Package {itemId} was paid for on {fmtTime(proof.redeemedAt)} by {shortAddr(proof.redeemedBy)}. Do not buy or use its contents.
          </p>
        </NeonBox>
      )}
    </div>
  );
}

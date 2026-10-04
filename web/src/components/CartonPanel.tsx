"use client";

import { useCallback, useEffect, useState } from "react";
import { publicClient } from "@/lib/chain";
import { CHAINSEAL, Role, ZERO, type CartonView, type EntityView } from "@/lib/contracts";
import { isCartonId } from "@/lib/ids";
import { fmtTime, parseUsd, shortAddr } from "@/lib/format";
import { humanizeError, sendTx, type WalletCtx } from "@/lib/wallet";
import ScanOrType from "./ScanOrType";
import { Field, NeonBox, Notice, Title, Trail } from "./ui";
import type { Address } from "viem";

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Gudang + serah terima + unpack. Satu komponen untuk Pabrik, Distributor, dan Seller:
 * aksi yang tampil mengikuti role dan posisi karton.
 */
export default function CartonPanel({ ctx, role }: { ctx: WalletCtx; role: number }) {
  const [held, setHeld] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<string[]>([]);
  const [entities, setEntities] = useState<EntityView[]>([]);
  const [carton, setCarton] = useState<CartonView | null>(null);
  const [shipTo, setShipTo] = useState("");
  const [price, setPrice] = useState("5");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok" | "info"; text: string } | null>(null);

  const loadLists = useCallback(async () => {
    const [h, i, e] = await Promise.all([
      publicClient.readContract({ ...CHAINSEAL, functionName: "heldCartonCodes", args: [ctx.address] }),
      publicClient.readContract({ ...CHAINSEAL, functionName: "incomingCartonCodes", args: [ctx.address] }),
      publicClient.readContract({ ...CHAINSEAL, functionName: "listEntities" }),
    ]);
    setHeld([...(h as string[])]);
    setIncoming([...(i as string[])]);
    setEntities([...(e as EntityView[])]);
  }, [ctx.address]);

  const loadCarton = useCallback(async (code: string) => {
    const c = (await publicClient.readContract({ ...CHAINSEAL, functionName: "getCarton", args: [code] })) as unknown as CartonView;
    if (!c.exists) {
      setCarton(null);
      setMsg({ kind: "error", text: `${code} was not found on-chain.` });
      return;
    }
    setMsg(null);
    setCarton(c);
  }, []);

  useEffect(() => {
    loadLists().catch(() => {});
  }, [loadLists]);

  const onId = async (id: string) => {
    if (!isCartonId(id)) {
      setMsg({ kind: "error", text: "This is not a carton QR. Carton IDs start with KARTON-." });
      return;
    }
    try {
      await loadCarton(id);
    } catch (e) {
      setMsg({ kind: "error", text: humanizeError(e) });
    }
  };

  const run = async (okText: string, fn: () => Promise<unknown>) => {
    if (!carton) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await Promise.all([loadLists(), loadCarton(carton.code)]);
      setMsg({ kind: "ok", text: okText });
    } catch (e) {
      setMsg({ kind: "error", text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const isHolder = carton && same(carton.holder, ctx.address);
  const isRecipient = carton && same(carton.pendingTo, ctx.address);
  const hasPending = carton && !same(carton.pendingTo, ZERO);
  const canShip = isHolder && !hasPending && !carton.unpacked && (role === Role.Factory || role === Role.Distributor) && carton.transferCount < 5;
  const canUnpack = isHolder && !hasPending && !carton.unpacked && role === Role.Seller;
  const recipients = entities.filter((e) => e.kyc && e.role !== Role.None && !same(e.wallet, ctx.address));
  const holderName = carton ? carton.trailNames[carton.trailNames.length - 1] || shortAddr(carton.holder) : "";

  return (
    <div className="space-y-4">
      <NeonBox>
        <Title>Scan carton</Title>
        <ScanOrType placeholder="KARTON-101" onId={onId} />
      </NeonBox>

      <NeonBox>
        <Title>Warehouse</Title>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm text-zinc-300">Incoming (awaiting receipt)</p>
            {incoming.length === 0 ? (
              <p className="text-sm text-zinc-500">No shipments yet.</p>
            ) : (
              <ul className="space-y-1">
                {incoming.map((c) => (
                  <li key={c}>
                    <button type="button" className="btn-neon w-full text-left font-mono" onClick={() => onId(c)}>
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm text-zinc-300">Stock on hand</p>
            {held.length === 0 ? (
              <p className="text-sm text-zinc-500">Warehouse is empty.</p>
            ) : (
              <ul className="space-y-1">
                {held.map((c) => (
                  <li key={c}>
                    <button type="button" className="btn-neon w-full text-left font-mono" onClick={() => onId(c)}>
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button type="button" className="mt-3 text-sm text-cyan-400 underline decoration-dotted" onClick={() => loadLists()}>
          Reload
        </button>
      </NeonBox>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {carton && (
        <NeonBox>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-mono text-xl font-bold text-white">{carton.code}</h3>
            <span className="text-sm text-zinc-300">
              Transfers {carton.transferCount}/5 · {carton.unpacked ? "Unpacked" : "Sealed"}
            </span>
          </div>
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-zinc-400">Product</dt>
            <dd>{carton.productName}</dd>
            <dt className="text-zinc-400">Batch</dt>
            <dd>{carton.batchId}</dd>
            <dt className="text-zinc-400">Minted</dt>
            <dd>{fmtTime(carton.mintedAt)}</dd>
            <dt className="text-zinc-400">Held by</dt>
            <dd>{holderName}</dd>
            {hasPending && (
              <>
                <dt className="text-zinc-400">Heading to</dt>
                <dd className="text-amber-300">{shortAddr(carton.pendingTo)} (awaiting receipt)</dd>
              </>
            )}
          </dl>
          <p className="mb-1 text-sm text-zinc-400">Custody trail</p>
          <Trail names={carton.trailNames} />

          <div className="mt-4 space-y-3">
            {isRecipient && (
              <button
                type="button"
                className="btn-neon w-full"
                disabled={busy}
                onClick={() => run("Carton received.", () => sendTx(ctx, { ...CHAINSEAL, functionName: "receiveCarton", args: [carton.code] }))}
              >
                {busy ? "Processing…" : "Receive this carton"}
              </button>
            )}

            {canShip && (
              <div className="space-y-2">
                <Field label="Ship to" hint={recipients.length === 0 ? "No Distributor/Seller registered yet. Register one in the Register wallet tab." : undefined}>
                  <select className="input-neon" value={shipTo} onChange={(e) => setShipTo(e.target.value)}>
                    <option value="">Select recipient</option>
                    {recipients.map((r) => (
                      <option key={r.wallet} value={r.wallet}>
                        {r.name} ({r.role === Role.Seller ? "Seller" : "Distributor"}) {shortAddr(r.wallet)}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  type="button"
                  className="btn-neon w-full"
                  disabled={busy || !shipTo}
                  onClick={() => run("Shipment created. The recipient must scan and confirm.", () => sendTx(ctx, { ...CHAINSEAL, functionName: "shipCarton", args: [carton.code, shipTo as Address] }))}
                >
                  {busy ? "Processing…" : "Ship carton"}
                </button>
              </div>
            )}

            {isHolder && hasPending && (
              <button
                type="button"
                className="btn-danger w-full"
                disabled={busy}
                onClick={() => run("Shipment cancelled.", () => sendTx(ctx, { ...CHAINSEAL, functionName: "cancelShipment", args: [carton.code] }))}
              >
                Cancel shipment
              </button>
            )}

            {canUnpack && (
              <div className="space-y-2">
                <Field label="Retail price per item (USDG)" hint="All 10 items are activated at this price; payments go to your shop wallet.">
                  <input className="input-neon" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
                <button
                  type="button"
                  className="btn-neon w-full"
                  disabled={busy || !(Number(price) > 0)}
                  onClick={() => run("Carton unpacked. 10 items are active and ready to sell.", () => sendTx(ctx, { ...CHAINSEAL, functionName: "unpackCarton", args: [carton.code, parseUsd(price)] }))}
                >
                  {busy ? "Processing…" : "Unpack carton"}
                </button>
              </div>
            )}

            {!isRecipient && !isHolder && <Notice kind="info">You neither hold nor are addressed to receive this carton.</Notice>}
          </div>
        </NeonBox>
      )}
    </div>
  );
}

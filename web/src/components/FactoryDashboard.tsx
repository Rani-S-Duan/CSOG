"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { publicClient } from "@/lib/chain";
import { CHAINSEAL, Role, type EntityView, type ItemProof } from "@/lib/contracts";
import { genItemCodes, normalizeId } from "@/lib/ids";
import { shortAddr } from "@/lib/format";
import { humanizeError, sendTx, type WalletCtx } from "@/lib/wallet";
import { isAddress, type Address } from "viem";
import CartonPanel from "./CartonPanel";
import QrSheet from "./QrSheet";
import { qrValueFor, siteBase } from "@/lib/links";
import { Field, NeonBox, Notice, Title } from "./ui";

type Tab = "mint" | "register" | "warehouse" | "reprint";

export default function FactoryDashboard({ ctx }: { ctx: WalletCtx }) {
  const [tab, setTab] = useState<Tab>("mint");
  const tabs: [Tab, string][] = [
    ["mint", "Mint carton"],
    ["register", "Register wallet"],
    ["warehouse", "Warehouse & ship"],
    ["reprint", "Reprint labels"],
  ];
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={tab === id ? "btn-neon bg-cyan-400 !text-black" : "btn-neon"}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "mint" && <MintPanel ctx={ctx} />}
      {tab === "register" && <RegisterPanel ctx={ctx} />}
      {tab === "warehouse" && <CartonPanel ctx={ctx} role={Role.Factory} />}
      {tab === "reprint" && <ReprintPanel />}
    </div>
  );
}

function MintPanel({ ctx }: { ctx: WalletCtx }) {
  const [code, setCode] = useState("KARTON-101");
  const [product, setProduct] = useState("Cough Syrup Demo 100ml");
  const [batch, setBatch] = useState("BATCH-2026-A1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [minted, setMinted] = useState<string[] | null>(null);

  const id = normalizeId(code);
  const items = useMemo(() => genItemCodes(id), [id]);
  const valid = /^KARTON-[A-Z0-9-]+$/.test(id) && product.trim() && batch.trim();

  const mint = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sendTx(ctx, { ...CHAINSEAL, functionName: "mintCarton", args: [id, product.trim(), batch.trim(), items] });
      setMinted([id, ...items]);
      setMsg({ kind: "ok", text: `${id} minted with 10 items. Print the QR labels below and attach them to the packaging.` });
    } catch (e) {
      setMsg({ kind: "error", text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <NeonBox>
        <Title>Mint a new carton</Title>
        <div className="space-y-3">
          <Field label="Carton ID" hint="Format KARTON-number. 10 item IDs are generated automatically (ITEM-number-01 to 10).">
            <input className="input-neon font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Product name">
            <input className="input-neon" value={product} onChange={(e) => setProduct(e.target.value)} />
          </Field>
          <Field label="Batch number">
            <input className="input-neon" value={batch} onChange={(e) => setBatch(e.target.value)} />
          </Field>
          <button type="button" className="btn-neon w-full" disabled={busy || !valid} onClick={mint}>
            {busy ? "Minting on-chain…" : "Mint carton + 10 items"}
          </button>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </div>
      </NeonBox>
      {minted && (
        <NeonBox>
          {/localhost|127\.0\.0\.1/.test(siteBase()) && (
            <p className="mb-2 text-sm text-amber-300">
              These QR codes point to localhost. After deploying, use the Reprint labels tab on your Vercel site before printing.
            </p>
          )}
          <QrSheet title={`QR labels ${minted[0]}`} ids={minted} qrValue={qrValueFor(siteBase())} />
        </NeonBox>
      )}
    </div>
  );
}

function RegisterPanel({ ctx }: { ctx: WalletCtx }) {
  const [wallet, setWallet] = useState("");
  const [role, setRole] = useState<number>(Role.Distributor);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [entities, setEntities] = useState<EntityView[]>([]);

  const load = useCallback(async () => {
    const e = (await publicClient.readContract({ ...CHAINSEAL, functionName: "listEntities" })) as EntityView[];
    setEntities([...e]);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const register = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sendTx(ctx, { ...CHAINSEAL, functionName: "registerEntity", args: [wallet as Address, role, name.trim()] });
      setMsg({ kind: "ok", text: "Registered and KYC ticked." });
      setWallet("");
      setName("");
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (w: Address) => {
    setBusy(true);
    setMsg(null);
    try {
      await sendTx(ctx, { ...CHAINSEAL, functionName: "revokeEntity", args: [w] });
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: humanizeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <NeonBox>
        <Title>Register Distributor / Seller</Title>
        <div className="space-y-3">
          <Field label="Wallet address" hint="Ask the partner to sign in, then copy the address from their profile header.">
            <input className="input-neon font-mono" placeholder="0x…" value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </Field>
          <Field label="Role">
            <select className="input-neon" value={role} onChange={(e) => setRole(Number(e.target.value))}>
              <option value={Role.Distributor}>Distributor</option>
              <option value={Role.Seller}>Seller (retailer)</option>
            </select>
          </Field>
          <Field label="Business name" hint="Shown to consumers as the payee and in the custody trail.">
            <input className="input-neon" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button type="button" className="btn-neon w-full" disabled={busy || !isAddress(wallet) || !name.trim()} onClick={register}>
            {busy ? "Processing…" : "Register and tick KYC"}
          </button>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </div>
      </NeonBox>

      <NeonBox>
        <Title>Registered entities</Title>
        {entities.length === 0 ? (
          <p className="text-sm text-zinc-500">No entities yet.</p>
        ) : (
          <ul className="divide-y divide-cyan-400/20">
            {entities.map((e) => (
              <li key={e.wallet} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-semibold text-white">{e.name}</span>{" "}
                  <span className="text-zinc-400">
                    {e.role === Role.Seller ? "Seller" : e.role === Role.Distributor ? "Distributor" : "Revoked"} · {shortAddr(e.wallet)} · KYC {e.kyc ? "verified" : "inactive"}
                  </span>
                </span>
                {e.kyc && (
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => revoke(e.wallet)}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </NeonBox>
    </div>
  );
}

/** Cetak ulang label QR untuk karton yang sudah di-mint (lembar asli hanya tampil sesaat setelah mint). */
function ReprintPanel() {
  const [code, setCode] = useState("KARTON-102");
  const [base, setBase] = useState("");
  useEffect(() => setBase(siteBase()), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ids, setIds] = useState<string[] | null>(null);
  const id = normalizeId(code);

  const load = async () => {
    setBusy(true);
    setError("");
    setIds(null);
    try {
      const items = genItemCodes(id);
      const proof = (await publicClient.readContract({ ...CHAINSEAL, functionName: "getItemProof", args: [items[0]] })) as unknown as ItemProof;
      if (proof.status === 0 || proof.cartonCode !== id) {
        setError("Carton not found, or its item IDs do not follow the standard pattern (ITEM-number-01 to 10).");
        return;
      }
      setIds([id, ...items]);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <NeonBox>
        <Title>Reprint QR labels</Title>
        <div className="space-y-3">
          <Field label="Carton ID" hint="Only for cartons minted from this app. Item labels show the QR and a sequence number; the carton label shows its ID.">
            <input className="input-neon font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Website URL" hint="Item QR codes open this address with the item ID. Use your final Vercel URL.">
            <input className="input-neon font-mono" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://your-project.vercel.app" />
          </Field>
          <button type="button" className="btn-neon w-full" disabled={busy || !/^https?:\/\//.test(base) || !/^KARTON-[A-Z0-9-]+$/.test(id)} onClick={load}>
            {busy ? "Checking…" : "Show labels"}
          </button>
          {error && <Notice kind="error">{error}</Notice>}
        </div>
      </NeonBox>
      {ids && (
        <NeonBox>
          {/localhost|127\.0\.0\.1/.test(base) && (
            <p className="mb-2 text-sm text-amber-300">
              Warning: these QR codes point to localhost and will not work for consumers. Use your Vercel URL.
            </p>
          )}
          <QrSheet title={`QR labels ${ids[0]}`} ids={ids} qrValue={qrValueFor(base)} />
        </NeonBox>
      )}
    </div>
  );
}

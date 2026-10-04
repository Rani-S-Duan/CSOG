"use client";

import type { ReactNode } from "react";

export function NeonBox({
  children,
  tone = "cyan",
  className = "",
}: {
  children: ReactNode;
  tone?: "cyan" | "red" | "green" | "amber";
  className?: string;
}) {
  const cls = { cyan: "neon-box", red: "neon-box-red", green: "neon-box-green", amber: "neon-box-amber" }[tone];
  return <section className={`${cls} p-4 ${className}`}>{children}</section>;
}

export function Title({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold text-cyan-400">{children}</h2>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  const color = { error: "text-red-400 border-red-500", ok: "text-emerald-300 border-emerald-400", info: "text-cyan-300 border-cyan-400" }[kind];
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`border-l-2 bg-zinc-950 px-3 py-2 text-sm ${color}`}>
      {children}
    </p>
  );
}

/** Jejak kustodi: Pabrik -> Distributor -> ... -> Toko */
export function Trail({ names }: { names: string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white">
      {names.map((n, i) => (
        <li key={`${n}-${i}`} className="flex items-center gap-2">
          <span className="border border-cyan-400/60 px-2 py-0.5 text-cyan-300">{n || "(unnamed)"}</span>
          {i < names.length - 1 && <span aria-hidden className="text-zinc-500">›</span>}
        </li>
      ))}
    </ol>
  );
}

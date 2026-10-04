import { formatUnits, parseUnits } from "viem";
import { USDG_DECIMALS } from "./contracts";

export const fmtUsd = (v: bigint | undefined) =>
  `$${Number(formatUnits(v ?? 0n, USDG_DECIMALS)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const parseUsd = (s: string) => parseUnits(s || "0", USDG_DECIMALS);

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");

export const fmtTime = (ts: bigint | number) =>
  ts ? new Date(Number(ts) * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "-";

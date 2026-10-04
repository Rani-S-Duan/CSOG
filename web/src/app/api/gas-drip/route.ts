import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

/**
 * Gas sponsor testnet: mengirim sedikit ETH Arbitrum Sepolia ke wallet Privy baru
 * supaya pengguna tidak perlu tahu soal gas. Aman karena:
 *  - token akses Privy diverifikasi (JWKS Privy),
 *  - hanya mengirim bila saldo di bawah threshold,
 *  - cooldown per alamat.
 * Upgrade produksi: ganti dengan paymaster ERC-4337 (mis. ZeroDev) lewat Privy smart wallets.
 */
export const runtime = "nodejs";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const DRIP = parseEther(process.env.GAS_DRIP_ETH ?? "0.0008");
const THRESHOLD = parseEther(process.env.GAS_DRIP_THRESHOLD_ETH ?? "0.0002");
const COOLDOWN_MS = 10 * 60 * 1000;

const lastDrip = new Map<string, number>();
const jwks = APP_ID ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`)) : null;

export async function POST(req: NextRequest) {
  try {
    const key = process.env.SPONSOR_PRIVATE_KEY;
    if (!key || !jwks) return NextResponse.json({ ok: false, reason: "sponsor-not-configured" }, { status: 503 });

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ ok: false, reason: "no-token" }, { status: 401 });
    await jwtVerify(token, jwks, { issuer: "privy.io", audience: APP_ID });

    const { address } = (await req.json()) as { address?: string };
    if (!address || !isAddress(address)) return NextResponse.json({ ok: false, reason: "bad-address" }, { status: 400 });

    const now = Date.now();
    const prev = lastDrip.get(address.toLowerCase()) ?? 0;
    if (now - prev < COOLDOWN_MS) return NextResponse.json({ ok: true, skipped: "cooldown" });

    const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) });
    const balance = await publicClient.getBalance({ address });
    if (balance >= THRESHOLD) return NextResponse.json({ ok: true, skipped: "has-gas" });

    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
    const wallet = createWalletClient({ account, chain: arbitrumSepolia, transport: http(RPC) });
    lastDrip.set(address.toLowerCase(), now);
    const hash = await wallet.sendTransaction({ to: address, value: DRIP });
    return NextResponse.json({ ok: true, hash });
  } catch (e) {
    console.error("gas-drip error", e);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}

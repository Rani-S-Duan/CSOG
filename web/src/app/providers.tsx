"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { CHAIN, RPC_URL } from "@/lib/chain";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function Providers({ children }: { children: ReactNode }) {
  if (!APP_ID) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="neon-box p-4">
          <h1 className="text-lg font-semibold text-cyan-400">Configuration incomplete</h1>
          <p className="mt-2 text-sm text-white">
            Set <code className="text-cyan-300">NEXT_PUBLIC_PRIVY_APP_ID</code> in <code className="text-cyan-300">web/.env.local</code>, then restart the server.
          </p>
        </div>
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["google", "email", "wallet"],
        appearance: { theme: "dark", accentColor: "#22d3ee", landingHeader: "Sign in to ChainSeal OG", loginMessage: "No wallet app or seed phrase needed." },
        defaultChain: CHAIN,
        supportedChains: [{ ...CHAIN, rpcUrls: { default: { http: [RPC_URL] } } }],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false, // tanpa popup konfirmasi: terasa seperti dompet digital biasa
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { publicClient } from "@/lib/chain";
import { CHAINSEAL, Role, isDeployed } from "@/lib/contracts";
import { useWalletCtx } from "@/lib/wallet";
import CartonPanel from "@/components/CartonPanel";
import ConsumerView from "@/components/ConsumerView";
import FactoryDashboard from "@/components/FactoryDashboard";
import Header from "@/components/Header";
import { NeonBox, Notice } from "@/components/ui";

export default function Home() {
  const { login } = usePrivy();
  const { ready, authenticated, ctx, email } = useWalletCtx();
  const [role, setRole] = useState<number>(Role.None);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [balanceVersion, setBalanceVersion] = useState(0);

  useEffect(() => {
    setRoleLoaded(false);
    if (!ctx || !isDeployed) {
      setRole(Role.None);
      setRoleLoaded(true);
      return;
    }
    publicClient
      .readContract({ ...CHAINSEAL, functionName: "roleOf", args: [ctx.address] })
      .then((r) => setRole(Number(r)))
      .catch(() => setRole(Role.None))
      .finally(() => setRoleLoaded(true));
  }, [ctx]);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-3xl font-bold text-cyan-400">ChainSeal OG</h1>
        <p className="mt-1 text-white">Scan the package. Pay. The package is locked forever.</p>
      </div>

      {!isDeployed && (
        <Notice kind="info">Contracts are not deployed yet. Run the deploy in the contracts folder, then reload.</Notice>
      )}

      {!ready && <p className="text-sm text-zinc-400">Loading…</p>}

      {ready && !authenticated && (
        <>
          <ConsumerView ctx={null} />
          <NeonBox>
            <p className="mb-3 text-sm text-zinc-300">
              Factories, distributors, shops and buyers sign in here. A wallet is created automatically: no MetaMask, no seed phrase.
            </p>
            <button type="button" className="btn-neon w-full" onClick={() => login()}>
              Sign in with Google
            </button>
          </NeonBox>
        </>
      )}

      {ready && authenticated && !ctx && <p className="text-sm text-zinc-400">Setting up wallet…</p>}

      {ctx && (
        <>
          <Header ctx={ctx} role={role} email={email} balanceVersion={balanceVersion} />
          {!roleLoaded ? (
            <p className="text-sm text-zinc-400">Checking role…</p>
          ) : role === Role.Factory ? (
            <FactoryDashboard ctx={ctx} />
          ) : role === Role.Distributor || role === Role.Seller ? (
            <CartonPanel ctx={ctx} role={role} />
          ) : (
            <ConsumerView ctx={ctx} onPaid={() => setBalanceVersion((v) => v + 1)} />
          )}
        </>
      )}
    </main>
  );
}

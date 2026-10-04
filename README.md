# ChainSeal OG (Once Guard)

**Scan the package. Pay. The package is locked forever.**

ChainSeal OG (Once Guard) is a phygital RWA protocol for supply chains and point of sale. It stops recycled and counterfeit packaging in FMCG and pharma by combining **on-chain custody tracking** with **atomic payment and a one-time lock (Once Guard)**. Built on **Arbitrum Sepolia** for the Arbitrum Open House Singapore Online Buildathon.

| | |
|---|---|
| **Live app** | https://chainseal-og.vercel.app |
| **Demo video** | ADD_VIDEO_LINK |
| **Source code** | https://github.com/Rani-S-Duan/CSOG |
| **ChainSeal contract** | [`0x7bd586Bf789dCB55ad64Eef2010E23c63DC7f4C9`](https://sepolia.arbiscan.io/address/0x7bd586Bf789dCB55ad64Eef2010E23c63DC7f4C9) |
| **MockUSDG contract** | [`0x3801B585C6E941EBBCeDC7e4631D9f517f23942f`](https://sepolia.arbiscan.io/address/0x3801B585C6E941EBBCeDC7e4631D9f517f23942f) |
| **Network** | Arbitrum Sepolia (chainId 421614) |

---

## The problem

Scavengers collect used bottles and boxes, refill them with fake product and sell them again. A printed QR code or barcode cannot tell a genuine, never-sold package from a refilled one, because the code stays valid after the first sale.

## The solution

Every carton and every item gets an on-chain identity. When a consumer pays for an item, **one transaction** pulls the money, sends it to the shop and **locks that item as `REDEEMED`**. If the same package is scanned again, the app shows a red warning: the package was already paid for and is probably used or counterfeit.

1. **Factory** mints a carton that wraps exactly 10 items. Each carton and each item gets a QR code.
2. The carton moves Factory → Distributor → ... → Seller. Maximum **5 transfers**, with a two-step handover (the sender ships, the receiver scans and confirms). The last hop must go to a Seller.
3. **Seller** scans the carton, taps **Unpack** and sets the retail price. All 10 items become active and are bound to the shop's wallet.
4. **Consumer** scans an item QR with the phone camera. The website opens and shows the custody history, factory name, authenticity status and price.
5. The consumer signs in with Google (no wallet app, no seed phrase) and taps **Pay**. In one transaction: USDG moves from the consumer to the seller and the item is locked as `REDEEMED`.
6. Scanning the same package again shows **ALREADY REDEEMED / THIS IS PROBABLY USED OR COUNTERFEIT**.

Wholesale (B2B) prices never go on-chain. Only the retail price set at unpack time is stored.

---

## Try it in 5 minutes (no setup)

Open the live app on your phone or laptop: **https://chainseal-og.vercel.app**

**1. Verify an item without signing in**

| Link | What you should see |
|------|---------------------|
| [`/?item=ITEM-101-01`](https://chainseal-og.vercel.app/?item=ITEM-101-01) | Green **GENUINE PRODUCT** with product, batch, item ID, carton, custody trail, price and payee |
| [`/?item=ITEM-101-10`](https://chainseal-og.vercel.app/?item=ITEM-101-10) | Red **ALREADY REDEEMED** (this item was paid during testing) |
| [`/?item=ITEM-FAKE-1`](https://chainseal-og.vercel.app/?item=ITEM-FAKE-1) | Red **NOT REGISTERED** (an ID that was never minted) |

Items from a carton that the shop has not unpacked yet show a yellow **NOT ACTIVATED YET** screen.

**2. Pay for an item (consumer flow)**

1. Open [`/?item=ITEM-101-02`](https://chainseal-og.vercel.app/?item=ITEM-101-02) and tap **Sign in to pay**.
2. Sign in with Google or email. A wallet is created for you automatically.
3. Tap **Get $100 (Faucet)** in the header to receive test USDG.
4. Open the item link again and tap **Pay**. Your balance drops and the shop receives the money.
5. Open the same link once more: it is now red, **ALREADY REDEEMED**.

Demo items that are still unpaid: `ITEM-101-01` to `ITEM-101-08`. Each can be paid once.

Notes:
- Transactions need a little testnet ETH for gas. The app sends starter ETH to new wallets automatically. If a transaction hangs, the sponsor wallet may be empty: send a few cents of Arbitrum Sepolia ETH to the address shown in the header (any faucet works).
- Camera scanning needs HTTPS, which the live app has. You can also open the `?item=` links directly.

**3. Staff roles (Factory, Distributor, Seller)**

Staff screens are permissioned: only wallets registered by the Factory admin can use them (this is the RBAC + KYC design). To see the full B2B flow, watch the demo video, or deploy your own instance with the steps below.

---

## Architecture

```
 Factory (admin)       Distributor           Seller (shop)         Consumer
 ────────────────      ────────────────      ────────────────      ────────────────
 mintCarton            shipCarton            receiveCarton         scan QR (item link)
 registerEntity        receiveCarton         unpackCarton(price)   getItemProof (read)
 shipCarton                                                        payWithPermit ──┐
        │                    │                     │                               │
        └────────────────────┴───────── ChainSeal.sol ◄────────────────────────────┘
                                        │  RBAC + KYC flag, custody, item status,
                                        │  Once Guard
                                        ▼
                                  MockUSDG.sol (ERC-20 + permit + faucet)
                                  USDG goes straight from consumer to seller

 Browser (Next.js, one app, menus change with the wallet role)
   Privy "Sign in with Google" → embedded wallet → viem → Arbitrum Sepolia
   /api/gas-drip (server) sends starter ETH to new wallets
```

### State machines

```
Carton: Minted (factory) → ship → pending → receive → held by receiver (count + 1)
        (max 5 receives, the 5th must be a Seller) → unpack → Unpacked

Item:   None → mint → Sealed → unpack carton → Active → pay → Redeemed (locked)
```

## Smart contracts

| Function | Caller | Purpose |
|----------|--------|---------|
| `registerEntity` / `revokeEntity` | Factory admin | Register a Distributor or Seller and set the KYC flag |
| `mintCarton` | Factory admin | Mint a carton with exactly 10 item IDs |
| `shipCarton` / `cancelShipment` | Current holder | Start or cancel a handover |
| `receiveCarton` | Intended recipient | Confirm the handover, increments the transfer count |
| `unpackCarton` | Seller holding the carton | Set the retail price, activate the 10 items |
| `payWithPermit` / `pay` | Anyone with USDG | Atomic payment and lock |
| `getItemProof`, `getCarton`, `roleOf`, `listEntities` | Anyone (read) | Verification and UI data |

**Security notes**
- OpenZeppelin v5: `AccessControl`, `ReentrancyGuard`, `SafeERC20`, `ERC20Permit`, `EnumerableSet`.
- Checks-effects-interactions: the item is locked **before** the token transfer, and the whole payment reverts if the transfer fails.
- `permit` is wrapped in `try/catch`, so a front-run permit cannot block a payment.
- Custom errors, ID length limits, zero-address checks, role + KYC checks on every privileged action.
- 17 automated tests (`npm test` in `contracts/`): RBAC and KYC, minting, handover, the 5-transfer rule, unpack, permit payment, double-redeem rejection, atomic revert on low balance, faucet cooldown.
- Not audited.

## Tech stack

Solidity 0.8.28 · OpenZeppelin 5.1 · Hardhat 2 · Next.js 15 · React 19 · Tailwind CSS 3 · viem 2 · Privy (embedded wallets, Google login) · html5-qrcode · qrcode · Vercel

## Project structure

```
contracts/    Hardhat project (ChainSeal.sol, MockUSDG.sol, tests, deploy/seed/verify scripts)
web/          Next.js app (role dashboards, consumer view, QR scanner, gas-drip API route)
deployments/  Deployed addresses
```

---

## Run your own instance

You need Node.js 20+, a Privy app (free), a testnet-only wallet with Arbitrum Sepolia ETH, and optionally an Etherscan API key for verification.

### 1. Deploy the contracts

```bash
cd contracts && npm install
cp .env.example .env
npm test                  # 17 passing
npm run deploy:sepolia
npm run verify:sepolia    # optional
```

`contracts/.env`:

| Variable | Meaning |
|----------|---------|
| `DEPLOYER_PRIVATE_KEY` | Testnet-only wallet. Never use a wallet that holds real funds |
| `FACTORY_NAME` | Display name of the factory |
| `FACTORY_ADMIN_ADDRESS` | Wallet address of the factory's web login (optional second admin) |
| `ARBISCAN_API_KEY` | For source verification |

The deploy script writes the addresses and ABIs into `web/src/contracts/`.

### 2. Run the web app

```bash
cd web && npm install
cp .env.example .env.local
npm run dev               # http://localhost:3000
```

`web/.env.local`:

| Variable | Meaning |
|----------|---------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | From the Privy dashboard. Enable Google, Email and Wallet login, and add your site URL to **Allowed origins** |
| `SPONSOR_PRIVATE_KEY` | Testnet wallet that pays starter gas for new users (server-side only) |
| `GAS_DRIP_ETH`, `GAS_DRIP_THRESHOLD_ETH` | Starter gas amount and the balance below which it is sent (for example `0.0002` and `0.00005`) |
| `NEXT_PUBLIC_RPC_URL` | Optional RPC override |
| `NEXT_PUBLIC_SITE_URL` | Optional. Public URL baked into item QR codes |


## Design decisions

- **Two-step handover** mirrors a real "scan to receive" flow and prevents sending to a wrong address. The transfer count only increases when the receiver confirms.
- **`payWithPermit` (ERC-2612)** makes payment one signature and one transaction. The UI falls back to approve + pay when a token has no permit.
- **Any ERC-20 can be used.** `ChainSeal` takes the token address in its constructor, so real USDG can replace `MockUSDG` without code changes. At build time we did not find a Paxos USDG testnet deployment on Arbitrum Sepolia (Paxos lists Ethereum Sepolia, Solana Devnet and Ink Sepolia), which is why a mock token is used for the demo.
- **KYC is an MVP placeholder:** `isKYCVerified` is set when the admin registers a wallet. Roadmap: oracle or B2B KYC provider.
- **Gas sponsorship** is a small server route for the testnet demo. Roadmap: ERC-4337 paymaster.
- **On-chain warehouse lists:** held and incoming cartons are tracked with `EnumerableSet`, so the UI needs no indexer or log scanning.

## Known limitations and roadmap

- **QR copying before the first sale.** The QR encodes a plain item ID. Once Guard stops a *paid* ID from being sold twice, but an *unpaid* ID could be photographed and printed on a fake. Planned fixes: a scratch-off secret code whose hash is stored on-chain, anti-tamper seals, NFC tags, and scan-location anomaly detection. Item IDs should also be random instead of sequential in production.
- **Look-alike websites.** A fake QR could point to a fake site. Planned: print the official domain on the label and educate consumers.
- Real KYC, paymaster-based gas, an indexer and analytics dashboard, private B2B margin proofs, and deployment to Robinhood Chain (EVM-compatible, not tested yet).
- Some Solidity comments are written in Indonesian. Function, event and error names are in English.
- Contracts are not audited. Testnet only.

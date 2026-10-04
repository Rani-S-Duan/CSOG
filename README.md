# ChainSeal OG

Phygital RWA protocol for supply chain and point of sale. It stops recycled and counterfeit packaging in FMCG and pharma using **Once Guard** and **atomic payment**. Runs on **Arbitrum Sepolia**.

Built for the Arbitrum Open House Singapore Online Buildathon.

## The problem
Scavengers collect used packaging, refill it with fake product and resell it. A printed QR code alone cannot tell a genuine new item from a refilled one.

## How it works
1. The **factory** mints a carton that wraps 10 items. Each carton and each item gets its own QR code.
2. The carton moves Factory, Distributor, Seller (max 5 transfers, two-step handover: ship, then scan and receive).
3. The **seller** scans the carton, taps **Unpack** and sets the retail price. All 10 items become active.
4. The **consumer** scans an item QR and sees the custody history, factory name, authenticity status and price, then taps **Pay**.
5. In **one transaction**: USDG is pulled from the consumer, sent to the seller, and the item is locked as `REDEEMED` (Once Guard).
6. Scanning the same package again shows a red screen: **ALREADY REDEEMED / THIS IS PROBABLY USED OR COUNTERFEIT**.

Consumers sign in with Google (Privy embedded wallet): no MetaMask, no seed phrase. A testnet faucet gives $100 of Mock USDG.

## Deployed contracts (Arbitrum Sepolia, chainId 421614)
| Contract | Address |
|----------|---------|
| ChainSeal | [`0x7bd586Bf789dCB55ad64Eef2010E23c63DC7f4C9`](https://sepolia.arbiscan.io/address/0x7bd586Bf789dCB55ad64Eef2010E23c63DC7f4C9) |
| MockUSDG | [`0x3801B585C6E941EBBCeDC7e4631D9f517f23942f`](https://sepolia.arbiscan.io/address/0x3801B585C6E941EBBCeDC7e4631D9f517f23942f) |

Some Solidity comments are written in Indonesian. Function, event and error names are in English.

## Tech
Solidity 0.8.28, OpenZeppelin 5 (AccessControl, ReentrancyGuard, SafeERC20, ERC20Permit), Hardhat, Next.js 15, Tailwind, viem, Privy.

## Run locally
```bash
# contracts
cd contracts && npm install
cp .env.example .env          # DEPLOYER_PRIVATE_KEY, ARBISCAN_API_KEY, FACTORY_ADMIN_ADDRESS
npm test                      # 17 tests
npm run deploy:sepolia
npm run verify:sepolia

# web
cd ../web && npm install
cp .env.example .env.local    # NEXT_PUBLIC_PRIVY_APP_ID, SPONSOR_PRIVATE_KEY
npm run dev
```

## Design notes
- **Token:** `ChainSeal` takes any ERC-20 in its constructor. `MockUSDG` is testnet only (Paxos lists no USDG on Arbitrum Sepolia); swap in real USDG by changing the constructor argument. The UI falls back to approve + pay when permit is not supported.
- **KYC:** `isKYCVerified` is an MVP placeholder set when the admin registers a wallet. Roadmap: oracle or B2B KYC provider.
- **Gas:** a small server route sends starter ETH to new testnet wallets. Roadmap: ERC-4337 paymaster.

## Known limitations and roadmap
- The QR contains a plain ID. Once Guard stops a paid ID from being sold twice, but an unpaid ID could be photographed and printed on a fake. Planned fixes: scratch-off secret code (hash stored on-chain), anti-tamper seals, NFC tags, and scan-location anomaly detection.
- Contracts are not audited.

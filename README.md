# onchain

The Web3 side of Tatas Handharu's portfolio, served at onchain.tatas.anxentlab.my.id. The main site (tatas.anxentlab.my.id, repo tatashandharu15/portofolio) links here and loads no wallet code itself.

Phase 1: connect MetaMask and read balances (native coin + major tokens) across Ethereum, Base, Arbitrum, Polygon and BNB Chain, valued in USD and IDR. Read only: no signature, no transaction, nothing stored server-side.

Stack: Next.js 16 App Router, wagmi 3 + viem 2, TanStack Query. Prices from DefiLlama, USD/IDR from Frankfurter (ECB), both cached for 60 s in `/api/prices`.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000 in a browser with MetaMask installed.

## Structure

- `src/lib/wagmi.ts`: chains, transports, injected connector (MetaMask via EIP-6963)
- `src/lib/tokens.ts`: chain metadata and the curated token list (decimals read on-chain)
- `src/lib/portfolio.ts`: one multicall per chain, run in the visitor's browser
- `src/app/api/prices/route.ts`: price feed for a fixed key list only (no visitor input)
- `src/components/WalletBar.tsx`, `src/components/Dashboard.tsx`: UI
- `next.config.ts`: security headers (CSP, frame-ancestors none, HSTS)

## Environment variables (all optional)

Public RPCs are used by default. They are rate limited, so for production set private endpoints in Vercel:

- `NEXT_PUBLIC_RPC_ETHEREUM`
- `NEXT_PUBLIC_RPC_BASE`
- `NEXT_PUBLIC_RPC_ARBITRUM`
- `NEXT_PUBLIC_RPC_POLYGON`
- `NEXT_PUBLIC_RPC_BSC`

These are exposed to the browser, so use keys restricted to the onchain domain in the provider dashboard.

## Deploy (Vercel Hobby)

1. Push this folder to a new GitHub repo, e.g. tatashandharu15/onchain.
2. Vercel → Add New → Project → import the repo (preset Next.js).
3. Project → Settings → Domains → add `onchain.tatas.anxentlab.my.id`.
4. At the DNS provider for anxentlab.my.id add `CNAME onchain.tatas → cname.vercel-dns.com`.

## Roadmap

Phase 2: Guestbook.sol (Foundry) on Base Sepolia, Sign-In with Ethereum, token approvals with revoke, full token discovery via an indexer.
Phase 3: EIP-712 endorsements, NFTs, visitor badge, Ponder indexing, Base mainnet.
PRD: `Web3 & Blockchain/03-projects/web3-portfolio/PRD.md`.

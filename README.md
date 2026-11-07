# onchain

The Web3 side of Tatas Handharu's portfolio, served at onchain.tatas.anxentlab.my.id. The main site (tatas.anxentlab.my.id, repo tatashandharu15/portofolio) links here and loads no wallet code itself.

Phase 1: connect MetaMask and read balances (native coin + major tokens) across Ethereum, Base, Arbitrum, Polygon and BNB Chain, valued in USD and IDR. Read only: no signature, no transaction, nothing stored server-side.

Phase 2: an on-chain guestbook on Base Sepolia. `contracts/` holds the Foundry project (Guestbook.sol, unit/fuzz/invariant tests, deploy script); the dApp reads the latest entries and lets a connected wallet sign (switching to Base Sepolia if needed).

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
- `src/lib/guestbook.ts`, `src/lib/guestbookAbi.ts`: guestbook address, chain and ABI
- `src/components/WalletBar.tsx`, `src/components/Dashboard.tsx`, `src/components/Guestbook.tsx`: UI
- `contracts/`: Foundry project
- `next.config.ts`: security headers (CSP, frame-ancestors none, HSTS)

## Contracts (Foundry)

Deployed: Guestbook on Base Sepolia at `0x930b86E72b6F2c64fdc0263cf4f0126888b5Cec7` (owner `0x1450329C78487f0A28c47a819e77D4De575370f7`, block 55725414, verified on Basescan and Sourcify): https://sepolia.basescan.org/address/0x930b86e72b6f2c64fdc0263cf4f0126888b5cec7

```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0
forge build
forge test -vv
forge coverage
```

`Guestbook.sol`: 140-byte messages, one per address per hour, entries stored for paging, owner can hide entries in the UI (`Ownable2Step`). Tests cover every revert path, the cooldown boundary, pagination edges, fuzzed lengths/waits/ranges, and four invariants driven by a handler.

### Deploy to Base Sepolia

Use an encrypted keystore, never a raw private key in `.env`:

```bash
cast wallet import deployer --interactive
export ETHERSCAN_API_KEY=your_etherscan_v2_key
forge script script/DeployGuestbook.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
```

The deployer needs a little Base Sepolia ETH (any Base Sepolia faucet). Put the printed address in Vercel as `NEXT_PUBLIC_GUESTBOOK_ADDRESS` and redeploy. Until it is set, the guestbook section shows "deployment in progress".

To moderate: `cast send <address> "setHidden(uint256,bool)" <id> true --rpc-url base_sepolia --account deployer`. Hiding only affects this UI; the message stays on-chain.

If you change the contract ABI, regenerate `src/lib/guestbookAbi.ts` from `contracts/out/Guestbook.sol/Guestbook.json`.

## Environment variables (all optional)

Public RPCs are used by default. They are rate limited, so for production set private endpoints in Vercel:

- `NEXT_PUBLIC_RPC_ETHEREUM`
- `NEXT_PUBLIC_RPC_BASE`
- `NEXT_PUBLIC_RPC_ARBITRUM`
- `NEXT_PUBLIC_RPC_POLYGON`
- `NEXT_PUBLIC_RPC_BSC`
- `NEXT_PUBLIC_RPC_BASE_SEPOLIA`

Guestbook:

- `NEXT_PUBLIC_GUESTBOOK_ADDRESS`: deployed Guestbook address on Base Sepolia

These are exposed to the browser, so use keys restricted to the onchain domain in the provider dashboard.

## Deploy (Vercel Hobby)

1. Push this folder to a new GitHub repo, e.g. tatashandharu15/onchain.
2. Vercel → Add New → Project → import the repo (preset Next.js).
3. Project → Settings → Domains → add `onchain.tatas.anxentlab.my.id`.
4. At the DNS provider for anxentlab.my.id add `CNAME onchain.tatas → cname.vercel-dns.com`.

## Roadmap

Phase 2 (done): Guestbook.sol on Base Sepolia.
Phase 2b: token approvals with revoke and full token discovery (needs an indexer API key, e.g. Alchemy).
Phase 3: Sign-In with Ethereum, EIP-712 endorsements, NFTs, visitor badge, Ponder indexing, Base mainnet.
PRD: `Web3 & Blockchain/03-projects/web3-portfolio/PRD.md`.

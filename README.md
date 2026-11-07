# onchain

The Web3 side of Tatas Handharu's portfolio, served at onchain.tatas.anxentlab.my.id. The main site (tatas.anxentlab.my.id, repo tatashandharu15/portofolio) links here and loads no wallet code itself.

Phase 1: connect MetaMask and read balances (native coin + major tokens) across Ethereum, Base, Arbitrum, Polygon and BNB Chain, valued in USD and IDR. Read only: no signature, no transaction, nothing stored server-side.

Phase 2: an on-chain guestbook on Base Sepolia. `contracts/` holds the Foundry project (Guestbook.sol, unit/fuzz/invariant tests, deploy script); the dApp reads the latest entries and lets a connected wallet sign (switching to Base Sepolia if needed).

Phase 2b: token approval scanner. `/api/approvals` finds Approval / ApprovalForAll events for an owner through Etherscan API V2, with Blockscout as fallback (server-side keys), the browser re-checks every candidate's current allowance on-chain, flags unlimited approvals and spenders that are not contracts, and lets the connected owner revoke (approve 0 / setApprovalForAll false). The address passes through the route without being logged or stored.

Phase 3a: gasless skill endorsements. `contracts/src/Endorsements.sol` accepts endorsements directly or as EIP-712 signatures submitted by anyone (`endorseBySig`). Replay protection: domain separator (chain + contract), per-endorser nonce, deadline, one endorsement per (address, skill); EOA and ERC-1271 smart-account signatures. `/api/endorse` is a relayer: it validates the request, verifies the signature off-chain against the current nonce, simulates, then submits with a testnet relayer wallet that pays the gas. Visitors can also choose "Pay gas myself".

Phase 3b: Sign-In with Ethereum (EIP-4361). `/api/auth/nonce` issues a single-use nonce in a signed httpOnly cookie; `/api/auth/verify` checks domain, nonce, freshness, chain and the signature (EOA or smart account via ERC-1271/6492, viem `verifySiweMessage`) and sets an HMAC-signed session cookie (8 h, SameSite=Strict). No database. The site owner is whoever owns the Guestbook contract on-chain; a signed-in owner gets an owner panel (relayer balance, server config, counts, served only by the owner-gated `/api/admin/status`) and Hide/Unhide on guestbook entries.

Phase 2c: full token and NFT discovery. `/api/assets` uses Alchemy's Token API (`alchemy_getTokenBalances` + batched `alchemy_getTokenMetadata`) and NFT API v3 (`getNFTsForOwner`, SPAM filter when the plan allows it) with DefiLlama prices. Native balances stay on the browser multicall; if discovery fails on a chain, the dashboard falls back to the curated token list there. Tokens without a price are hidden by default (often airdropped spam). Only https images are rendered.

Visitor badge: `contracts/src/VisitorBadge.sol`, a soulbound ERC-721 (ERC-5192) that anyone who signed the Guestbook can mint once. Transfers and approvals revert; artwork and metadata are fully on-chain SVG/JSON with no user text.

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
- `src/app/api/approvals/route.ts`, `src/lib/approvals.ts`, `src/components/Approvals.tsx`: approval scanner and revoke
- `src/lib/guestbook.ts`, `src/lib/guestbookAbi.ts`: guestbook address, chain and ABI
- `src/components/WalletBar.tsx`, `src/components/Dashboard.tsx`, `src/components/Guestbook.tsx`: UI
- `src/lib/endorsements.ts`, `src/lib/endorsementsAbi.ts`, `src/components/Endorsements.tsx`, `src/app/api/endorse/route.ts`: endorsements and relayer
- `src/lib/session.ts`, `src/lib/useSession.ts`, `src/app/api/auth/*`, `src/app/api/admin/status/route.ts`, `src/components/OwnerPanel.tsx`: Sign-In with Ethereum and owner panel
- `src/app/api/assets/route.ts`, `src/lib/assets.ts`, `src/components/NftGallery.tsx`: token and NFT discovery
- `src/lib/badge.ts`, `src/lib/badgeAbi.ts`, `src/components/VisitorBadge.tsx`: visitor badge
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

### Deploy Endorsements

```bash
forge script script/DeployEndorsements.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
```

Seeds five skills. Put the address in Vercel as `NEXT_PUBLIC_ENDORSEMENTS_ADDRESS`.

Deployed: Endorsements on Base Sepolia at `0x121cB00B3E837057e1EefbD951F166F2Ce576E55` (owner `0x1450329C78487f0A28c47a819e77D4De575370f7`, block 55749740, verified on Basescan and Sourcify). Test suite at deploy: 47 passed (incl. 24 Endorsements unit/fuzz and 2 replay-hunting invariants).

### Deploy VisitorBadge

```bash
GUESTBOOK=0x930b86E72b6F2c64fdc0263cf4f0126888b5Cec7 forge script script/DeployVisitorBadge.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
```

Put the address in Vercel as `NEXT_PUBLIC_BADGE_ADDRESS`. The badge section is hidden until it is set.

Deployed: VisitorBadge on Base Sepolia at `0x611D092f2a2A574E88321e9ffF493630b1F6ba37` (Guestbook `0x930b…Cec7`, block 55767448, verified on Basescan and Sourcify).

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

Endorsements:

- `NEXT_PUBLIC_ENDORSEMENTS_ADDRESS`: deployed Endorsements address on Base Sepolia
- `RELAYER_PRIVATE_KEY` (server-only): private key of a dedicated Base Sepolia relayer wallet holding a small amount of test ETH. It only ever calls `endorseBySig` on the configured contract. Without it, visitors can still endorse by paying gas themselves.

Token and NFT discovery (server-only):

- `ALCHEMY_API_KEY`: Alchemy API key. Without it the dashboard uses the curated token list and shows no NFT section.

Visitor badge:

- `NEXT_PUBLIC_BADGE_ADDRESS`: deployed VisitorBadge address (same chain as the Guestbook)

Sign-In with Ethereum (server-only):

- `SESSION_SECRET`: random string of at least 32 characters used to sign session and nonce cookies, e.g. `openssl rand -base64 48`. Without it the Sign in button is hidden. Changing it signs everyone out.

Approval scanner (server-only, never prefix with NEXT_PUBLIC):

- `ETHERSCAN_API_KEY`: Etherscan API V2 key. Without it the approvals section says the scanner is not configured.
- `BLOCKSCOUT_API_KEY` (optional): Blockscout API key, used as fallback for chains your Etherscan plan does not cover. On free plans neither Etherscan nor Blockscout covers Base or BNB Chain (Blockscout: "Featured chain 8453 requires one of the following plans: Builder, Business, Pro"), so those chains are shown as "not covered yet".

These are exposed to the browser, so use keys restricted to the onchain domain in the provider dashboard.

## Deploy (Vercel Hobby)

1. Push this folder to a new GitHub repo, e.g. tatashandharu15/onchain.
2. Vercel → Add New → Project → import the repo (preset Next.js).
3. Project → Settings → Domains → add `onchain.tatas.anxentlab.my.id`.
4. At the DNS provider for anxentlab.my.id add `CNAME onchain.tatas → cname.vercel-dns.com`.

## Roadmap

Phase 2 (done): Guestbook.sol on Base Sepolia.
Phase 2b (done): token approvals with revoke.
Phase 2c (done): full token and NFT discovery.
Phase 3a (done): EIP-712 endorsements with relayer.
Phase 3b (done): Sign-In with Ethereum and owner panel.
Later: NFTs, visitor badge, Ponder indexing, Base mainnet.
PRD: `Web3 & Blockchain/03-projects/web3-portfolio/PRD.md`.

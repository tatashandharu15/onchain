# AGENTS.md

onchain: wallet-facing dApp for onchain.tatas.anxentlab.my.id. Read README.md first.

Rules for agents:
- Never add code that requests private keys or seed phrases, or that triggers signatures/transactions without explicit user action.
- Do not add third-party scripts; keep the CSP in next.config.ts intact.
- Visitor addresses and balances must not be stored, logged or cached on the server. The only route that receives an address is /api/approvals, which forwards it to Etherscan or Blockscout and returns; keep it that way.
- ETHERSCAN_API_KEY and BLOCKSCOUT_API_KEY are server-only; never expose them with a NEXT_PUBLIC_ prefix.
- SIWE: keep the domain, nonce, freshness and signature checks in /api/auth/verify; owner-only data must be gated server-side by readSession() plus an on-chain owner check, never only in the UI. SESSION_SECRET is server-only.
- New tokens go in src/lib/tokens.ts; verify the address on the chain explorer.
- Contract changes in contracts/ need matching Foundry tests (unit + fuzz, and an invariant when state rules change); regenerate src/lib/guestbookAbi.ts after ABI changes.
- Never put private keys in .env or scripts; deploy with `--account` keystores. The one exception is RELAYER_PRIVATE_KEY: a dedicated testnet relayer wallet with a small balance, set only in Vercel env, never committed, and only used by /api/endorse to call endorseBySig.
- /api/endorse must keep verifying the signature off-chain and simulating before it spends relayer gas.
- Keep design tokens in src/app/globals.css in sync with the main site repo (tatashandharu15/portofolio).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

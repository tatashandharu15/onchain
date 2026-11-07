import { base, baseSepolia } from "wagmi/chains";

/**
 * Which chain the site's own contracts (Guestbook, Endorsements, VisitorBadge) live on.
 * NEXT_PUBLIC_CONTRACTS_CHAIN = "base" for Base mainnet, anything else (default) for Base Sepolia.
 * The gasless endorsement demo always stays on Base Sepolia, so the relayer never spends real ETH.
 */
export const CONTRACTS_CHAIN = process.env.NEXT_PUBLIC_CONTRACTS_CHAIN === "base" ? base : baseSepolia;
export const IS_MAINNET = CONTRACTS_CHAIN.id === base.id;

export const GASLESS_CHAIN = baseSepolia;

const EXPLORERS: Record<number, string> = {
  [base.id]: "https://basescan.org",
  [baseSepolia.id]: "https://sepolia.basescan.org",
};
export const explorerFor = (chainId: number) => EXPLORERS[chainId] ?? "https://basescan.org";

export const CONTRACTS_EXPLORER = explorerFor(CONTRACTS_CHAIN.id);
export const CONTRACTS_CHAIN_LABEL = IS_MAINNET ? "Base" : "Base Sepolia";

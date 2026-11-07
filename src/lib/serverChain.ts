import { createPublicClient, http, type Address } from "viem";
import { arbitrum, base, baseSepolia, bsc, mainnet, polygon } from "viem/chains";
import { guestbookAbi, GUESTBOOK_ADDRESS, GUESTBOOK_CHAIN } from "./guestbook";

/** Server-side public clients, using the same optional RPC overrides as the browser. */
const RPC: Record<number, string | undefined> = {
  [mainnet.id]: process.env.NEXT_PUBLIC_RPC_ETHEREUM,
  [base.id]: process.env.NEXT_PUBLIC_RPC_BASE,
  [arbitrum.id]: process.env.NEXT_PUBLIC_RPC_ARBITRUM,
  [polygon.id]: process.env.NEXT_PUBLIC_RPC_POLYGON,
  [bsc.id]: process.env.NEXT_PUBLIC_RPC_BSC,
  [baseSepolia.id]: process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA,
};
const CHAINS = [mainnet, base, arbitrum, polygon, bsc, baseSepolia];

export const supportedChainIds = new Set<number>(CHAINS.map((c) => c.id));

export function serverClient(chainId: number) {
  const chain = CHAINS.find((c) => c.id === chainId) ?? mainnet;
  return createPublicClient({ chain, transport: http(RPC[chain.id] || undefined) });
}

/**
 * The site owner is whoever owns the Guestbook contract on-chain, so ownership follows Ownable2Step transfers
 * without any config change. Returns null if the contract is not configured or unreachable.
 */
export async function siteOwner(): Promise<Address | null> {
  if (!GUESTBOOK_ADDRESS) return null;
  try {
    return await serverClient(GUESTBOOK_CHAIN.id).readContract({
      address: GUESTBOOK_ADDRESS,
      abi: guestbookAbi,
      functionName: "owner",
    });
  } catch {
    return null;
  }
}

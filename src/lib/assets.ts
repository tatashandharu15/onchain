import { formatUnits, type Address } from "viem";
import type { AssetsResponse, DiscoveredNft } from "@/app/api/assets/route";
import type { Holding, Portfolio } from "./portfolio";
import { CHAINS, chainMeta } from "./tokens";

export type Discovery = {
  configured: boolean;
  byChain: Record<number, AssetsResponse>;
};

export type ChainNfts = { chainId: number; nfts: DiscoveredNft[]; total: number };

/** Asks the server for full token/NFT discovery, one chain at a time to stay inside free-tier rate limits. */
export async function loadDiscovery(owner: Address): Promise<Discovery> {
  const byChain: Record<number, AssetsResponse> = {};
  let configured = true;
  for (const c of CHAINS) {
    try {
      const res = await fetch(`/api/assets?address=${owner}&chain=${c.id}`, { cache: "no-store" });
      const body = (await res.json()) as AssetsResponse;
      if (body.status === "unavailable" && body.reason === "not-configured") {
        configured = false;
        break;
      }
      byChain[c.id] = body;
    } catch {
      byChain[c.id] = { status: "unavailable", chainId: c.id, reason: "error" };
    }
  }
  return { configured, byChain };
}

export type MergedHolding = Holding & { unpriced: boolean; logo: string | null };

/**
 * Native coins always come from the browser multicall. ERC-20s come from discovery when it worked for that chain,
 * otherwise from the curated list, so a failing provider degrades to phase 1 behaviour instead of showing nothing.
 */
export function mergeHoldings(portfolio: Portfolio | undefined, discovery: Discovery | undefined): MergedHolding[] {
  if (!portfolio) return [];
  const out: MergedHolding[] = [];
  for (const c of CHAINS) {
    const curated = portfolio.holdings.filter((h) => h.chainId === c.id);
    const native = curated.filter((h) => h.address === "native");
    const d = discovery?.configured ? discovery.byChain[c.id] : undefined;
    const discoveredTokens = d && d.status === "ok" ? d.tokens : null;

    for (const h of native) out.push({ ...h, unpriced: h.priceUsd === null, logo: null });
    if (discoveredTokens) {
      for (const t of discoveredTokens) {
        const amount = Number(formatUnits(BigInt(t.balance), t.decimals));
        if (!(amount > 0)) continue;
        out.push({
          chainId: c.id,
          chainName: chainMeta(c.id)?.name ?? String(c.id),
          symbol: t.symbol,
          address: t.address,
          amount,
          priceUsd: t.priceUsd,
          valueUsd: t.priceUsd === null ? null : t.priceUsd * amount,
          unpriced: t.priceUsd === null,
          logo: t.logo,
        });
      }
    } else {
      for (const h of curated.filter((x) => x.address !== "native")) out.push({ ...h, unpriced: h.priceUsd === null, logo: null });
    }
  }
  return out.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
}

export function collectNfts(discovery: Discovery | undefined): ChainNfts[] {
  if (!discovery?.configured) return [];
  return CHAINS.flatMap((c) => {
    const d = discovery.byChain[c.id];
    return d && d.status === "ok" && d.nfts && d.nfts.length > 0 ? [{ chainId: c.id, nfts: d.nfts, total: d.nftTotal }] : [];
  });
}

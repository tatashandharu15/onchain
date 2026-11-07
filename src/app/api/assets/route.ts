import type { NextRequest } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { CHAINS } from "@/lib/tokens";

/**
 * Full token and NFT discovery for one owner on one chain, via Alchemy's Token API and NFT API (free tier),
 * with USD prices from DefiLlama. Native balances stay on the browser-side multicall.
 *
 * Privacy: like /api/approvals, the address passes through to Alchemy/DefiLlama and back; nothing is logged,
 * cached server-side or stored. The Alchemy key never reaches the browser.
 */

const ALCHEMY_HOST: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  137: "polygon-mainnet",
  56: "bnb-mainnet",
};
// Overridable for local tests only.
const ALCHEMY_BASE = process.env.ALCHEMY_BASE_URL; // e.g. http://localhost:8700 → {base}/{host}/v2/{key}
const LLAMA = process.env.DEFILLAMA_URL || "https://coins.llama.fi";

const MAX_TOKENS = 60;
const NFT_PAGE = 24;

export type DiscoveredToken = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  balance: string; // raw integer, decimal string
  priceUsd: number | null;
};

export type DiscoveredNft = {
  contract: Address;
  tokenId: string;
  name: string;
  collection: string;
  image: string | null;
  tokenType: string;
};

export type AssetsResponse =
  | {
      status: "ok";
      chainId: number;
      tokens: DiscoveredToken[] | null;
      tokensError: string | null;
      nfts: DiscoveredNft[] | null;
      nftTotal: number;
      nftsError: string | null;
    }
  | { status: "unavailable"; chainId: number; reason: string };

const url = (chainId: number, kind: "v2" | "nft/v3", key: string) => {
  const host = ALCHEMY_HOST[chainId];
  return ALCHEMY_BASE ? `${ALCHEMY_BASE}/${host}/${kind}/${key}` : `https://${host}.g.alchemy.com/${kind}/${key}`;
};

/** Only plain https images are rendered; anything else (ipfs:, data:, javascript:) is dropped. */
const safeImage = (u: unknown): string | null =>
  typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length < 2048 ? u : null;
const clean = (s: unknown, max = 64) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").slice(0, max) : "");

async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function discoverTokens(chainId: number, owner: Address, key: string): Promise<DiscoveredToken[]> {
  const endpoint = url(chainId, "v2", key);
  type Balances = { result?: { tokenBalances: { contractAddress: string; tokenBalance: string | null; error?: unknown }[] }; error?: { message: string } };
  const bal = await rpc<Balances>(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getTokenBalances",
    params: [owner, "erc20", { maxCount: 100 }],
  });
  if (bal.error || !bal.result) throw new Error(bal.error?.message ?? "Token balances unavailable");

  const held = bal.result.tokenBalances
    .filter((t) => t.tokenBalance && !t.error && BigInt(t.tokenBalance) > 0n && isAddress(t.contractAddress))
    .slice(0, MAX_TOKENS);
  if (held.length === 0) return [];

  type Meta = { id: number; result?: { name: string | null; symbol: string | null; decimals: number | null; logo: string | null } };
  const metas = await rpc<Meta[]>(
    endpoint,
    held.map((t, i) => ({ jsonrpc: "2.0", id: i, method: "alchemy_getTokenMetadata", params: [t.contractAddress] })),
  );
  const metaById = new Map(metas.map((m) => [m.id, m.result]));

  const llama = CHAINS.find((c) => c.id === chainId)?.llama;
  const prices: Record<string, number> = {};
  if (llama) {
    try {
      const keys = held.map((t) => `${llama}:${t.contractAddress.toLowerCase()}`).join(",");
      const res = await fetch(`${LLAMA}/prices/current/${keys}`, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { coins?: Record<string, { price?: number }> };
        for (const [k, v] of Object.entries(json.coins ?? {})) if (typeof v.price === "number") prices[k.toLowerCase()] = v.price;
      }
    } catch {
      // prices are optional; tokens just show as unpriced
    }
  }

  return held.map((t, i) => {
    const m = metaById.get(i);
    const address = getAddress(t.contractAddress);
    return {
      address,
      symbol: clean(m?.symbol, 24) || "Unknown",
      name: clean(m?.name) || "Unknown token",
      decimals: typeof m?.decimals === "number" && m.decimals >= 0 && m.decimals <= 36 ? m.decimals : 18,
      logo: safeImage(m?.logo),
      balance: BigInt(t.tokenBalance!).toString(),
      priceUsd: llama ? (prices[`${llama}:${t.contractAddress.toLowerCase()}`] ?? null) : null,
    };
  });
}

async function discoverNfts(chainId: number, owner: Address, key: string) {
  type NftResp = {
    ownedNfts?: {
      contract?: { address?: string; name?: string | null; openseaMetadata?: { collectionName?: string | null } };
      tokenId?: string;
      tokenType?: string;
      name?: string | null;
      image?: { thumbnailUrl?: string | null; cachedUrl?: string | null; pngUrl?: string | null };
    }[];
    totalCount?: number;
    error?: unknown;
  };
  const base = `${url(chainId, "nft/v3", key)}/getNFTsForOwner?owner=${owner}&withMetadata=true&pageSize=${NFT_PAGE}`;
  // The SPAM filter may be limited to paid plans or some chains; fall back to unfiltered if it is refused.
  let res = await fetch(`${base}&excludeFilters[]=SPAM`, { cache: "no-store" });
  if (!res.ok) res = await fetch(base, { cache: "no-store" });
  if (!res.ok) throw new Error(`NFT API HTTP ${res.status}`);
  const json = (await res.json()) as NftResp;
  if (!json.ownedNfts) throw new Error("NFT data unavailable");
  const nfts: DiscoveredNft[] = json.ownedNfts
    .filter((n) => n.contract?.address && isAddress(n.contract.address) && n.tokenId)
    .map((n) => {
      const collection = clean(n.contract?.openseaMetadata?.collectionName || n.contract?.name) || "Unknown collection";
      return {
        contract: getAddress(n.contract!.address!),
        tokenId: clean(n.tokenId, 80),
        name: clean(n.name) || `${collection} #${clean(n.tokenId, 20)}`,
        collection,
        image: safeImage(n.image?.thumbnailUrl) ?? safeImage(n.image?.cachedUrl) ?? safeImage(n.image?.pngUrl),
        tokenType: clean(n.tokenType, 16),
      };
    });
  return { nfts, total: typeof json.totalCount === "number" ? json.totalCount : nfts.length };
}

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const params = request.nextUrl.searchParams;
  const owner = params.get("address") ?? "";
  const chainId = Number(params.get("chain"));
  if (!isAddress(owner)) return Response.json({ error: "Invalid address" }, { status: 400 });
  if (!ALCHEMY_HOST[chainId]) return Response.json({ error: "Unsupported chain" }, { status: 400 });

  const key = (process.env.ALCHEMY_API_KEY ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
    const body: AssetsResponse = { status: "unavailable", chainId, reason: "not-configured" };
    return Response.json(body, { headers });
  }

  const addr = getAddress(owner);
  const [tokens, nfts] = await Promise.allSettled([discoverTokens(chainId, addr, key), discoverNfts(chainId, addr, key)]);
  const body: AssetsResponse = {
    status: "ok",
    chainId,
    tokens: tokens.status === "fulfilled" ? tokens.value : null,
    tokensError: tokens.status === "rejected" ? "Token discovery unavailable on this chain." : null,
    nfts: nfts.status === "fulfilled" ? nfts.value.nfts : null,
    nftTotal: nfts.status === "fulfilled" ? nfts.value.total : 0,
    nftsError: nfts.status === "rejected" ? "NFT discovery unavailable on this chain." : null,
  };
  return Response.json(body, { headers });
}

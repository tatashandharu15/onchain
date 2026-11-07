import { ALL_PRICE_KEYS } from "@/lib/tokens";

// Prices are shared by every visitor, so the response is cached and rebuilt at most once a minute.
// No visitor input reaches this handler: it only fetches the fixed key list.
export const revalidate = 60;

export type PricesResponse = {
  usd: Record<string, number>;
  usdIdr: number | null;
  updatedAt: string;
};

async function fetchUsdPrices(): Promise<Record<string, number>> {
  const url = `https://coins.llama.fi/prices/current/${ALL_PRICE_KEYS.join(",")}`;
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`DefiLlama ${res.status}`);
  const json = (await res.json()) as { coins: Record<string, { price: number }> };
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(json.coins ?? {})) {
    if (typeof v?.price === "number") out[key.toLowerCase()] = v.price;
  }
  return out;
}

async function fetchUsdIdr(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=IDR", { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { IDR?: number } };
    return json.rates?.IDR ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [usd, usdIdr] = await Promise.all([fetchUsdPrices(), fetchUsdIdr()]);
    const body: PricesResponse = { usd, usdIdr, updatedAt: new Date().toISOString() };
    return Response.json(body, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return Response.json({ error: "Price feed unavailable" }, { status: 502 });
  }
}

import { erc20Abi, formatUnits, type Address } from "viem";
import { getPublicClient } from "wagmi/actions";
import type { PricesResponse } from "@/app/api/prices/route";
import { CHAINS, TOKENS, tokenPriceKey } from "./tokens";
import { config } from "./wagmi";

export type Holding = {
  chainId: number;
  chainName: string;
  symbol: string;
  address: Address | "native";
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
};

export type ChainResult = { chainId: number; ok: boolean };

export type Portfolio = {
  holdings: Holding[];
  chains: ChainResult[];
  totalUsd: number;
};

/**
 * Reads native + curated ERC-20 balances on every chain in one multicall per chain.
 * Runs in the visitor's browser; nothing about the address is sent to our server.
 */
export async function loadPortfolio(owner: Address, prices: PricesResponse | undefined): Promise<Portfolio> {
  const usd = prices?.usd ?? {};
  const results = await Promise.all(
    CHAINS.map(async (chain) => {
      try {
        const client = getPublicClient(config, { chainId: chain.id as (typeof config.chains)[number]["id"] });
        const tokens = TOKENS.filter((t) => t.chainId === chain.id);
        const [native, calls] = await Promise.all([
          client.getBalance({ address: owner }),
          client.multicall({
            allowFailure: true,
            contracts: tokens.flatMap((t) => [
              { address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] } as const,
              { address: t.address, abi: erc20Abi, functionName: "decimals" } as const,
            ]),
          }),
        ]);

        const holdings: Holding[] = [];
        const nativeAmount = Number(formatUnits(native, 18));
        if (nativeAmount > 0) {
          const p = usd[chain.native.priceKey] ?? null;
          holdings.push({
            chainId: chain.id,
            chainName: chain.name,
            symbol: chain.native.symbol,
            address: "native",
            amount: nativeAmount,
            priceUsd: p,
            valueUsd: p === null ? null : p * nativeAmount,
          });
        }
        tokens.forEach((t, i) => {
          const bal = calls[i * 2];
          const dec = calls[i * 2 + 1];
          if (bal.status !== "success" || dec.status !== "success") return;
          const amount = Number(formatUnits(bal.result as bigint, Number(dec.result)));
          if (amount <= 0) return;
          const p = usd[tokenPriceKey(t)] ?? null;
          holdings.push({
            chainId: chain.id,
            chainName: chain.name,
            symbol: t.symbol,
            address: t.address,
            amount,
            priceUsd: p,
            valueUsd: p === null ? null : p * amount,
          });
        });
        return { chainId: chain.id, ok: true, holdings };
      } catch {
        return { chainId: chain.id, ok: false, holdings: [] as Holding[] };
      }
    }),
  );

  const holdings = results
    .flatMap((r) => r.holdings)
    .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  return {
    holdings,
    chains: results.map(({ chainId, ok }) => ({ chainId, ok })),
    totalUsd: holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
  };
}

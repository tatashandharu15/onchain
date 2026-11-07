"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import type { PricesResponse } from "@/app/api/prices/route";
import { fmtAmount, fmtIdr, fmtUsd, shortAddress } from "@/lib/format";
import { collectNfts, loadDiscovery, mergeHoldings } from "@/lib/assets";
import { loadPortfolio } from "@/lib/portfolio";
import { NftGallery } from "./NftGallery";
import { Approvals } from "./Approvals";
import { CHAINS, chainMeta } from "@/lib/tokens";

async function getPrices(): Promise<PricesResponse> {
  const res = await fetch("/api/prices");
  if (!res.ok) throw new Error("Price feed unavailable");
  return res.json();
}

export function Dashboard() {
  const { address: connected } = useConnection();
  const [watchInput, setWatchInput] = useState("");
  const [watched, setWatched] = useState<Address | null>(null);
  const owner = watched ?? connected ?? null;

  const prices = useQuery({ queryKey: ["prices"], queryFn: getPrices, staleTime: 60_000 });
  const portfolio = useQuery({
    queryKey: ["portfolio", owner, prices.dataUpdatedAt],
    queryFn: () => loadPortfolio(owner as Address, prices.data),
    enabled: !!owner && !prices.isPending,
    staleTime: 30_000,
  });

  const discovery = useQuery({
    queryKey: ["assets", owner],
    queryFn: () => loadDiscovery(owner as Address),
    enabled: !!owner,
    staleTime: 5 * 60_000,
  });
  const [showUnpriced, setShowUnpriced] = useState(false);

  const usdIdr = prices.data?.usdIdr ?? null;
  const merged = mergeHoldings(portfolio.data, discovery.data);
  const unpricedCount = merged.filter((h) => h.unpriced && h.address !== "native").length;
  const rows = merged.filter((h) => showUnpriced || !h.unpriced || h.address === "native");
  const total = portfolio.data ? merged.reduce((s, h) => s + (h.valueUsd ?? 0), 0) : null;
  const failed = portfolio.data?.chains.filter((c) => !c.ok) ?? [];
  const discoveryOn = discovery.data?.configured ?? false;
  const tokenGaps = discoveryOn
    ? CHAINS.filter((c) => {
        const d = discovery.data!.byChain[c.id];
        return !d || d.status !== "ok" || d.tokens === null;
      })
    : [];

  const byChain = CHAINS.map((c) => ({
    ...c,
    value: merged.filter((h) => h.chainId === c.id).reduce((s, h) => s + (h.valueUsd ?? 0), 0),
  }));

  return (
    <>
    <section className="dash px" aria-labelledby="dash-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="dash-title">
          {watched ? "Watching · read only" : connected ? "Connected wallet" : "Wallet dashboard"}
        </p>
        <form
          className="watch"
          onSubmit={(e) => {
            e.preventDefault();
            const v = watchInput.trim();
            if (isAddress(v)) setWatched(v);
          }}
        >
          <input
            className="watch-input t-mono"
            placeholder="0x… watch any address"
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Address to watch"
          />
          <button className="btn btn-ghost t-mono" type="submit" disabled={!isAddress(watchInput.trim())}>
            Watch
          </button>
          {watched && (
            <button
              className="btn btn-ghost t-mono"
              type="button"
              onClick={() => {
                setWatched(null);
                setWatchInput("");
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {!owner ? (
        <div className="empty">
          <p className="t-next">Connect MetaMask to see your assets across five chains.</p>
          <p className="t-body c-muted">
            Balances are read straight from public RPCs in your browser. This site never stores your address,
            never asks for a seed phrase, and the dashboard needs no signature or transaction.
          </p>
        </div>
      ) : (
        <>
          <div className="totals">
            <div>
              <p className="t-mono c-muted">Total value · {shortAddress(owner)}</p>
              <p className="t-h1 total">{portfolio.isPending ? "…" : fmtUsd(total)}</p>
              <p className="t-role c-muted">
                {portfolio.isPending ? "Reading 5 chains…" : fmtIdr(total !== null && usdIdr ? total * usdIdr : null)}
              </p>
            </div>
            <ul className="chain-bars" aria-label="Value per chain">
              {byChain.map((c) => {
                const pct = total ? (c.value / total) * 100 : 0;
                return (
                  <li key={c.id}>
                    <div className="chain-row t-mono">
                      <span>{c.name}</span>
                      <span className="c-muted">{fmtUsd(c.value)}</span>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {failed.length > 0 && (
            <p className="t-mono notice">
              Could not reach {failed.map((f) => chainMeta(f.chainId)?.name).join(", ")} RPC. Values may be incomplete.
            </p>
          )}
          {prices.isError && <p className="t-mono notice">Price feed unavailable. Amounts shown without value.</p>}

          <div className="table-wrap">
            <table className="holdings">
              <thead className="t-mono c-muted">
                <tr>
                  <th>Asset</th>
                  <th>Chain</th>
                  <th className="num">Amount</th>
                  <th className="num col-price">Price</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody className="t-body">
                {rows.map((h) => {
                  const explorer = chainMeta(h.chainId)?.explorer;
                  const href =
                    h.address === "native" ? `${explorer}/address/${owner}` : `${explorer}/token/${h.address}?a=${owner}`;
                  return (
                    <tr key={`${h.chainId}-${h.address}`}>
                      <td>
                        <a className="l-underline" href={href} target="_blank" rel="noopener noreferrer">
                          {h.symbol}
                        </a>
                        {h.unpriced && h.address !== "native" && <span className="ap-tag t-mono c-muted">No price</span>}
                      </td>
                      <td className="c-muted">{h.chainName}</td>
                      <td className="num">{fmtAmount(h.amount)}</td>
                      <td className="num c-muted col-price">{fmtUsd(h.priceUsd)}</td>
                      <td className="num">{fmtUsd(h.valueUsd)}</td>
                    </tr>
                  );
                })}
                {portfolio.data && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="c-muted">
                      {discoveryOn ? "No token balances found." : "No balances found for the tracked tokens."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {unpricedCount > 0 && (
            <button className="en-alt t-mono l-muted dash-unpriced" type="button" onClick={() => setShowUnpriced((v) => !v)}>
              {showUnpriced
                ? "Hide tokens without a price"
                : `Show ${unpricedCount} token${unpricedCount > 1 ? "s" : ""} without a price (often airdropped spam, never interact with them)`}
            </button>
          )}
          <div className="dash-foot t-mono c-muted">
            <span>
              {discovery.isFetching
                ? "Discovering all tokens and NFTs…"
                : discoveryOn
                  ? tokenGaps.length > 0
                    ? `All ERC-20 tokens via Alchemy; curated list used for ${tokenGaps.map((c) => c.name).join(", ")}.`
                    : "All ERC-20 tokens via Alchemy, prices from DefiLlama. Unpriced tokens are hidden by default."
                  : "Tracking native coins and major tokens."}
            </span>
            <button
              className="btn btn-ghost t-mono"
              type="button"
              onClick={() => {
                void portfolio.refetch();
                void discovery.refetch();
              }}
              disabled={portfolio.isFetching || discovery.isFetching}
            >
              {portfolio.isFetching || discovery.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </>
      )}
    </section>
    {owner && discoveryOn && <NftGallery owner={owner} items={collectNfts(discovery.data)} discovery={discovery.data} />}
    {owner && <Approvals owner={owner} canRevoke={!watched && !!connected && owner === connected} />}
    </>
  );
}

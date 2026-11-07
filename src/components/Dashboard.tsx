"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import type { PricesResponse } from "@/app/api/prices/route";
import { fmtAmount, fmtIdr, fmtUsd, shortAddress } from "@/lib/format";
import { loadPortfolio } from "@/lib/portfolio";
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

  const usdIdr = prices.data?.usdIdr ?? null;
  const total = portfolio.data?.totalUsd ?? null;
  const failed = portfolio.data?.chains.filter((c) => !c.ok) ?? [];

  const byChain = CHAINS.map((c) => ({
    ...c,
    value: portfolio.data?.holdings.filter((h) => h.chainId === c.id).reduce((s, h) => s + (h.valueUsd ?? 0), 0) ?? 0,
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
                {portfolio.data?.holdings.map((h) => {
                  const explorer = chainMeta(h.chainId)?.explorer;
                  const href =
                    h.address === "native" ? `${explorer}/address/${owner}` : `${explorer}/token/${h.address}?a=${owner}`;
                  return (
                    <tr key={`${h.chainId}-${h.address}`}>
                      <td>
                        <a className="l-underline" href={href} target="_blank" rel="noopener noreferrer">
                          {h.symbol}
                        </a>
                      </td>
                      <td className="c-muted">{h.chainName}</td>
                      <td className="num">{fmtAmount(h.amount)}</td>
                      <td className="num c-muted col-price">{fmtUsd(h.priceUsd)}</td>
                      <td className="num">{fmtUsd(h.valueUsd)}</td>
                    </tr>
                  );
                })}
                {portfolio.data && portfolio.data.holdings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="c-muted">
                      No balances found for the tracked tokens.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="dash-foot t-mono c-muted">
            <span>Tracking native coins and major tokens. Full token and NFT discovery arrives in phase 2.</span>
            <button className="btn btn-ghost t-mono" type="button" onClick={() => portfolio.refetch()} disabled={portfolio.isFetching}>
              {portfolio.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </>
      )}
    </section>
    {owner && <Approvals owner={owner} canRevoke={!watched && !!connected && owner === connected} />}
    </>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminStatus } from "@/app/api/admin/status/route";
import { shortAddress } from "@/lib/format";
import { GASLESS_CHAIN, explorerFor } from "@/lib/contracts";
import { useSession } from "@/lib/useSession";

/** Only rendered for the signed-in contract owner. The data itself is gated server-side by the SIWE session. */
export function OwnerPanel() {
  const session = useSession();
  const status = useQuery({
    queryKey: ["admin-status"],
    enabled: session.isOwner,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AdminStatus> => {
      const res = await fetch("/api/admin/status", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Unavailable");
      return body;
    },
  });

  if (!session.isOwner) return null;
  const s = status.data;
  const flag = (ok: boolean, optional = false) =>
    ok ? <span className="en-mine">set</span> : <span className={optional ? "c-muted" : "ap-warn"}>{optional ? "not set (optional)" : "missing"}</span>;

  return (
    <section className="dash px" aria-labelledby="op-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="op-title">
          Owner panel · signed in with Ethereum
        </p>
        <button className="btn btn-ghost t-mono" type="button" onClick={() => status.refetch()} disabled={status.isFetching}>
          {status.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {status.isPending ? (
        <p className="t-mono c-muted">Loading status…</p>
      ) : status.isError || !s ? (
        <p className="t-mono notice">{status.error instanceof Error ? status.error.message : "Status unavailable."}</p>
      ) : (
        <div className="op-grid">
          <div className="op-card">
            <p className="t-mono c-muted">Relayer · Base Sepolia</p>
            {s.relayer ? (
              <>
                <p className={`t-next ${s.relayer.low ? "ap-warn" : ""}`}>{Number(s.relayer.balanceEth).toFixed(5)} ETH</p>
                <a className="t-mono l-muted" href={`${explorerFor(GASLESS_CHAIN.id)}/address/${s.relayer.address}`} target="_blank" rel="noopener noreferrer">
                  {shortAddress(s.relayer.address)} ↗
                </a>
                {s.relayer.low && <p className="t-mono notice">Low balance: top up with Base Sepolia ETH.</p>}
              </>
            ) : (
              <p className="t-mono notice">Not configured or unreachable.</p>
            )}
          </div>
          <div className="op-card">
            <p className="t-mono c-muted">Guestbook</p>
            <p className="t-next">{s.guestbook ? `${s.guestbook.total} entries` : "—"}</p>
            <p className="t-mono c-muted">{s.guestbook ? `${s.guestbook.hidden} hidden · moderate in the list above` : "Not configured"}</p>
          </div>
          <div className="op-card">
            <p className="t-mono c-muted">Endorsements</p>
            <p className="t-next">{s.endorsements ? `${s.endorsements.total} total` : "—"}</p>
            <p className="t-mono c-muted">{s.endorsements ? `${s.endorsements.skills} skills` : "Not configured"}</p>
          </div>
          <div className="op-card">
            <p className="t-mono c-muted">Server config · contracts on {s.chain}</p>
            <ul className="op-config t-mono">
              <li>Etherscan key {flag(s.config.etherscan)}</li>
              <li>Blockscout key {flag(s.config.blockscout, true)}</li>
              <li>Relayer key {flag(s.config.relayer)}</li>
              <li>Guestbook address {flag(s.config.guestbook)}</li>
              <li>Endorsements address {flag(s.config.endorsements)}</li>
              <li>Gas-free demo address {flag(s.config.gaslessEndorsements, true)}</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, UserRejectedRequestError, type Address } from "viem";
import { useConfig, useConnection } from "wagmi";
import { simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { approveNoReturnAbi, loadChainApprovals, nftApprovalAbi, type ActiveApproval, type ChainApprovals } from "@/lib/approvals";
import { shortAddress } from "@/lib/format";
import { CHAINS, chainMeta } from "@/lib/tokens";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const listNames = (ids: number[]) => {
  const names = ids.map((id) => chainMeta(id)?.name ?? `chain ${id}`);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};
const keyOf = (a: ActiveApproval) => `${a.chainId}:${a.kind}:${a.token}:${a.spender}`;

function explain(err: unknown) {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in your wallet.";
    if (/insufficient funds/i.test(err.message)) return "Not enough native coin on this chain to pay gas.";
    return err.shortMessage;
  }
  return "Something went wrong.";
}

export function Approvals({ owner, canRevoke }: { owner: Address; canRevoke: boolean }) {
  const config = useConfig();
  const { chainId: walletChain } = useConnection();
  const [scanning, setScanning] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<{ key: string; msg: string } | null>(null);

  const scan = useQuery({
    queryKey: ["approvals", owner],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: ChainApprovals[] = [];
      // One chain at a time: the scanner shares a rate-limited Etherscan key.
      for (const c of CHAINS) {
        setScanning(c.name);
        out.push(await loadChainApprovals(owner, c.id).catch(() => ({ chainId: c.id, status: "unavailable" as const, reason: "Scan failed." })));
      }
      setScanning(null);
      setRevoked(new Set());
      return out;
    },
  });

  const items = (scan.data ?? []).flatMap((c) => (c.status === "ok" ? c.items : [])).filter((a) => !revoked.has(keyOf(a)));
  const unavailable = (scan.data ?? []).filter((c): c is Extract<ChainApprovals, { status: "unavailable" }> => c.status === "unavailable");
  const notCovered = unavailable.filter((u) => u.reason === "coverage").map((u) => u.chainId);
  const failed = unavailable.filter((u) => u.reason !== "coverage").map((u) => u.chainId);
  const truncatedChains = (scan.data ?? []).filter((c) => c.status === "ok" && c.truncated).map((c) => c.chainId);
  const risky = items.filter((a) => !a.spenderIsContract).length;
  const unlimited = items.filter((a) => a.unlimited).length;

  async function revoke(a: ActiveApproval) {
    const key = keyOf(a);
    setBusy(key);
    setError(null);
    try {
      const chainId = a.chainId as (typeof config.chains)[number]["id"];
      if (walletChain !== chainId) await switchChain(config, { chainId });
      let hash: `0x${string}`;
      if (a.kind === "erc20") {
        const { request } = await simulateContract(config, {
          account: owner,
          address: a.token,
          abi: approveNoReturnAbi,
          functionName: "approve",
          args: [a.spender, 0n],
          chainId,
        });
        hash = await writeContract(config, request);
      } else {
        const { request } = await simulateContract(config, {
          account: owner,
          address: a.token,
          abi: nftApprovalAbi,
          functionName: "setApprovalForAll",
          args: [a.spender, false],
          chainId,
        });
        hash = await writeContract(config, request);
      }
      await waitForTransactionReceipt(config, { hash, chainId });
      setRevoked((s) => new Set(s).add(key));
    } catch (err) {
      setError({ key, msg: explain(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="dash px" aria-labelledby="ap-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="ap-title">
          Token approvals · {shortAddress(owner)}
        </p>
        <button className="btn btn-ghost t-mono" type="button" onClick={() => scan.refetch()} disabled={scan.isFetching}>
          {scan.isFetching ? `Scanning ${scanning ?? ""}…` : "Rescan"}
        </button>
      </div>

      <div className="ap-intro">
        <p className="t-next">Who can still move your tokens?</p>
        <p className="t-body c-muted">
          Every approval you once gave a dApp stays active until you revoke it. Drainers abuse forgotten unlimited
          approvals. This list is checked live on-chain; revoking sets the allowance back to zero and costs a little gas
          on that chain.
        </p>
      </div>

      {scan.isPending ? (
        <p className="t-mono c-muted">Scanning {scanning ?? "chains"}…</p>
      ) : (
        <>
          <div className="ap-stats t-mono">
            <span>{items.length} active</span>
            <span className={unlimited ? "ap-warn" : "c-muted"}>{unlimited} unlimited</span>
            <span className={risky ? "ap-danger" : "c-muted"}>{risky} to non-contract spenders</span>
          </div>

          {items.length === 0 ? (
            <p className="t-body c-muted">No active approvals found on the chains that could be scanned.</p>
          ) : (
            <div className="table-wrap">
              <table className="holdings ap-table">
                <thead className="t-mono c-muted">
                  <tr>
                    <th>Asset</th>
                    <th>Chain</th>
                    <th>Spender</th>
                    <th className="num">Allowance</th>
                    <th className="num col-price">Last set</th>
                    <th className="num" aria-label="Action" />
                  </tr>
                </thead>
                <tbody className="t-body">
                  {items.map((a) => {
                    const meta = chainMeta(a.chainId);
                    const key = keyOf(a);
                    return (
                      <tr key={key}>
                        <td>
                          <a className="l-underline" href={`${meta?.explorer}/address/${a.token}`} target="_blank" rel="noopener noreferrer">
                            {a.label}
                          </a>
                        </td>
                        <td className="c-muted">{meta?.name}</td>
                        <td>
                          <a className="l-muted" href={`${meta?.explorer}/address/${a.spender}`} target="_blank" rel="noopener noreferrer">
                            {a.spenderLabel ?? shortAddress(a.spender)}
                          </a>
                          {!a.spenderIsContract && <span className="ap-tag ap-danger t-mono">Not a contract</span>}
                        </td>
                        <td className={`num ${a.unlimited ? "ap-warn" : ""}`}>{a.amount}</td>
                        <td className="num c-muted col-price">{dateFmt.format(new Date(a.lastTimestamp * 1000))}</td>
                        <td className="num">
                          {canRevoke ? (
                            <button className="btn btn-ghost t-mono" type="button" disabled={!!busy} onClick={() => revoke(a)}>
                              {busy === key ? "Revoking…" : "Revoke"}
                            </button>
                          ) : (
                            <span className="t-mono c-muted">Owner only</span>
                          )}
                          {error?.key === key && <p className="t-mono notice ap-err">{error.msg}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {notCovered.length > 0 && (
            <p className="t-mono c-muted ap-foot">Approvals on {listNames(notCovered)} are not covered yet.</p>
          )}
          {failed.length > 0 && (
            <p className="t-mono notice">Could not scan {listNames(failed)} right now. Try Rescan in a moment.</p>
          )}
          {truncatedChains.length > 0 && (
            <p className="t-mono c-muted ap-foot">
              {listNames(truncatedChains)} {truncatedChains.length > 1 ? "have" : "has"} a long approval history; the scan stopped
              at 3,000 events per chain, so this list may be incomplete.
            </p>
          )}
          <p className="t-mono c-muted ap-foot">
            Candidates come from Approval and ApprovalForAll events via Etherscan, proxied by this site without storing anything.
            {!canRevoke && " Connect the owning wallet to revoke."}
          </p>
        </>
      )}
    </section>
  );
}

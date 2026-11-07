"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hash } from "viem";
import { useConfig, useConnection } from "wagmi";
import { readContract, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/useSession";
import {
  GUESTBOOK_ADDRESS,
  GUESTBOOK_CHAIN,
  GUESTBOOK_EXPLORER,
  COOLDOWN_SECONDS,
  MAX_MESSAGE_BYTES,
  PAGE_SIZE,
  byteLength,
  guestbookAbi,
} from "@/lib/guestbook";

type Phase = "idle" | "switching" | "confirm" | "pending" | "done";

const timeFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const clockFmt = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" });

function explain(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in your wallet.";
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const args = revert.data?.args ?? [];
      if (name === "CooldownActive") return `One message per hour. You can sign again at ${clockFmt.format(new Date(Number(args[0]) * 1000))}.`;
      if (name === "MessageTooLong") return `Message is ${args[0]} bytes; the limit is ${args[1]}.`;
      if (name === "EmptyMessage") return "Write something first.";
    }
    if (/insufficient funds/i.test(err.message)) return "You need a little Base Sepolia ETH for gas. Any Base Sepolia faucet gives it for free.";
    return err.shortMessage;
  }
  return "Something went wrong.";
}

export function Guestbook() {
  const config = useConfig();
  const { address, status, chainId } = useConnection();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const session = useSession();
  const queryClient = useQueryClient();
  const ownerMode = session.isOwner;
  const [modBusy, setModBusy] = useState<bigint | null>(null);
  const [modError, setModError] = useState<string | null>(null);

  const entries = useQuery({
    queryKey: ["guestbook", GUESTBOOK_ADDRESS],
    enabled: !!GUESTBOOK_ADDRESS,
    refetchInterval: 30_000,
    queryFn: async () => {
      const base = { address: GUESTBOOK_ADDRESS!, abi: guestbookAbi, chainId: GUESTBOOK_CHAIN.id } as const;
      const total = await readContract(config, { ...base, functionName: "count" });
      const start = total > PAGE_SIZE ? total - PAGE_SIZE : 0n;
      const page = await readContract(config, { ...base, functionName: "getEntries", args: [start, PAGE_SIZE] });
      return {
        total,
        items: page
          .map((e, i) => ({ ...e, id: start + BigInt(i) }))
          .reverse(),
      };
    },
  });

  const bytes = byteLength(text.trim());
  const tooLong = bytes > MAX_MESSAGE_BYTES;
  const busy = phase === "switching" || phase === "confirm" || phase === "pending";
  const connected = status === "connected" && !!address;
  const visibleItems = (entries.data?.items ?? []).filter((e) => ownerMode || !e.hidden);

  async function setHidden(id: bigint, hidden: boolean) {
    if (!GUESTBOOK_ADDRESS || !address) return;
    setModBusy(id);
    setModError(null);
    try {
      if (chainId !== GUESTBOOK_CHAIN.id) await switchChain(config, { chainId: GUESTBOOK_CHAIN.id });
      const { request } = await simulateContract(config, {
        account: address,
        address: GUESTBOOK_ADDRESS,
        abi: guestbookAbi,
        functionName: "setHidden",
        args: [id, hidden],
        chainId: GUESTBOOK_CHAIN.id,
      });
      const hash = await writeContract(config, request);
      await waitForTransactionReceipt(config, { hash, chainId: GUESTBOOK_CHAIN.id });
      await entries.refetch();
      void queryClient.invalidateQueries({ queryKey: ["admin-status"] });
    } catch (err) {
      setModError(explain(err));
    } finally {
      setModBusy(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!GUESTBOOK_ADDRESS || !address || busy) return;
    const message = text.trim();
    if (!message || tooLong) return;
    setError(null);
    setTxHash(null);
    try {
      if (chainId !== GUESTBOOK_CHAIN.id) {
        setPhase("switching");
        await switchChain(config, { chainId: GUESTBOOK_CHAIN.id });
      }
      // Cheap pre-check for the most common revert, so the visitor gets a clear time instead of an RPC error.
      const last = await readContract(config, {
        address: GUESTBOOK_ADDRESS,
        abi: guestbookAbi,
        functionName: "lastSignedAt",
        args: [address],
        chainId: GUESTBOOK_CHAIN.id,
      });
      const availableAt = last === 0n ? 0 : Number(last) + COOLDOWN_SECONDS;
      if (availableAt * 1000 > Date.now()) {
        setPhase("idle");
        setError(`One message per hour. You can sign again at ${clockFmt.format(new Date(availableAt * 1000))}.`);
        return;
      }
      // Simulate first so contract errors (cooldown, length) show a clear message before MetaMask opens.
      const { request } = await simulateContract(config, {
        account: address,
        address: GUESTBOOK_ADDRESS,
        abi: guestbookAbi,
        functionName: "sign",
        args: [message],
        chainId: GUESTBOOK_CHAIN.id,
      });
      setPhase("confirm");
      const hash = await writeContract(config, request);
      setTxHash(hash);
      setPhase("pending");
      await waitForTransactionReceipt(config, { hash, chainId: GUESTBOOK_CHAIN.id });
      setPhase("done");
      setText("");
      await entries.refetch();
    } catch (err) {
      setPhase("idle");
      setError(explain(err));
    }
  }

  const label =
    phase === "switching"
      ? "Switching to Base Sepolia…"
      : phase === "confirm"
        ? "Confirm in MetaMask…"
        : phase === "pending"
          ? "Writing to chain…"
          : chainId !== GUESTBOOK_CHAIN.id && connected
            ? "Switch to Base Sepolia & sign"
            : "Sign guestbook";

  return (
    <section className="gb px" aria-labelledby="gb-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="gb-title">
          Guestbook · Base Sepolia
        </p>
        {GUESTBOOK_ADDRESS && (
          <a
            className="t-mono l-muted"
            href={`${GUESTBOOK_EXPLORER}/address/${GUESTBOOK_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Contract {shortAddress(GUESTBOOK_ADDRESS)} ↗
          </a>
        )}
      </div>

      <div className="gb-grid">
        <div className="gb-intro">
          <p className="t-next">Leave a message on-chain.</p>
          <p className="t-body c-muted">
            Up to 140 bytes, one message per hour, written by a contract I built and tested with Foundry. It runs on the
            Base Sepolia testnet, so gas is free test ETH. Messages are public and permanent.
          </p>

          {!GUESTBOOK_ADDRESS ? (
            <p className="t-mono notice">Contract deployment in progress. Check back soon.</p>
          ) : (
            <form className="gb-form" onSubmit={onSubmit}>
              <textarea
                className="gb-input t-body"
                rows={3}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (phase === "done") setPhase("idle");
                }}
                placeholder={connected ? "gm from Jakarta…" : "Connect MetaMask to write"}
                disabled={!connected || busy}
                aria-label="Guestbook message"
              />
              <div className="gb-actions">
                <span className={`t-mono ${tooLong ? "gb-over" : "c-muted"}`}>
                  {bytes}/{MAX_MESSAGE_BYTES} bytes
                </span>
                <button className="btn t-mono" type="submit" disabled={!connected || busy || !text.trim() || tooLong}>
                  {connected ? label : "Connect wallet to sign"}
                </button>
              </div>
              {error && <p className="t-mono notice">{error}</p>}
              {txHash && (
                <p className="t-mono c-muted gb-tx">
                  {phase === "done" ? "Signed. " : "Submitted. "}
                  <a className="l-underline" href={`${GUESTBOOK_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                    View transaction ↗
                  </a>
                </p>
              )}
            </form>
          )}
        </div>

        <ol className="gb-list" aria-label="Latest messages">
          {entries.isPending && GUESTBOOK_ADDRESS && <li className="t-mono c-muted">Reading entries…</li>}
          {entries.isError && <li className="t-mono notice">Could not read the guestbook right now.</li>}
          {entries.data && visibleItems.length === 0 && <li className="t-body c-muted">No messages yet. Be the first.</li>}
          {modError && <li className="t-mono notice">{modError}</li>}
          {visibleItems.map((e) => (
            <li key={e.id.toString()} className={`gb-item ${e.hidden ? "gb-hidden" : ""}`}>
              <p className="t-body gb-msg">{e.message}</p>
              <p className="t-mono c-muted">
                <a
                  className="l-muted"
                  href={`${GUESTBOOK_EXPLORER}/address/${e.author}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {e.author.toLowerCase() === address?.toLowerCase() ? "You" : shortAddress(e.author)}
                </a>
                {" · "}
                {timeFmt.format(new Date(Number(e.timestamp) * 1000))}
                {e.hidden && <span className="ap-tag t-mono">Hidden</span>}
              </p>
              {ownerMode && (
                <button
                  type="button"
                  className="en-alt t-mono l-muted gb-mod"
                  disabled={modBusy !== null}
                  onClick={() => setHidden(e.id, !e.hidden)}
                >
                  {modBusy === e.id ? "Confirm in MetaMask…" : e.hidden ? "Unhide" : "Hide"}
                </button>
              )}
            </li>
          ))}
          {entries.data && entries.data.total > PAGE_SIZE && (
            <li className="t-mono c-muted">Showing the latest {PAGE_SIZE.toString()} of {entries.data.total.toString()}.</li>
          )}
        </ol>
      </div>
    </section>
  );
}

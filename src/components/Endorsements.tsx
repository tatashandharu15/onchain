"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, UserRejectedRequestError, zeroAddress, type Hash } from "viem";
import { useConfig, useConnection } from "wagmi";
import {
  readContract,
  signTypedData,
  simulateContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { CONTRACTS_CHAIN, explorerFor } from "@/lib/contracts";
import {
  endorseDomain,
  endorsementNetworks,
  freshDeadline,
  endorseTypes,
  endorsementsAbi,
  type RelayResponse,
} from "@/lib/endorsements";
import { shortAddress } from "@/lib/format";

type Busy = { skillId: number; step: string } | null;

function explain(err: unknown) {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in your wallet.";
    if (/insufficient funds/i.test(err.message)) return "You need a little ETH on this network for gas.";
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

const NETWORKS = endorsementNetworks();
const ENDORSEMENTS_DEFAULT_CHAIN = CONTRACTS_CHAIN.id;

export function Endorsements() {
  const config = useConfig();
  const [netKey, setNetKey] = useState(NETWORKS[0]?.key);
  const net = NETWORKS.find((n) => n.key === netKey) ?? NETWORKS[0];
  const ADDRESS = net?.address ?? null;
  const CHAIN_ID = (net?.chainId ?? ENDORSEMENTS_DEFAULT_CHAIN) as (typeof config.chains)[number]["id"];
  const EXPLORER = explorerFor(CHAIN_ID);
  const { address, status, chainId } = useConnection();
  const connected = status === "connected" && !!address;
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ skillId: number; text: string; hash?: Hash; error?: boolean } | null>(null);

  const skills = useQuery({
    queryKey: ["endorsements", ADDRESS, CHAIN_ID, address ?? null],
    enabled: !!ADDRESS,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [names, counts, mine] = await readContract(config, {
        address: ADDRESS!,
        abi: endorsementsAbi,
        functionName: "getSkills",
        args: [address ?? zeroAddress],
        chainId: CHAIN_ID,
      });
      return names.map((name, i) => ({ id: i, name, count: Number(counts[i]), mine: mine[i] }));
    },
  });

  const total = skills.data?.reduce((s, k) => s + k.count, 0) ?? 0;

  async function ensureChain() {
    if (chainId !== CHAIN_ID) {
      await switchChain(config, { chainId: CHAIN_ID });
    }
  }

  async function directTx(skillId: number, fn: "endorse" | "unendorse") {
    const { request } = await simulateContract(config, {
      account: address!,
      address: ADDRESS!,
      abi: endorsementsAbi,
      functionName: fn,
      args: [BigInt(skillId)],
      chainId: CHAIN_ID,
    });
    return writeContract(config, request);
  }

  async function endorse(skillId: number, payMyself = false) {
    if (!net || !ADDRESS || !address) return;
    setNotice(null);
    try {
      setBusy({ skillId, step: `Switching to ${net.label}…` });
      await ensureChain();

      let hash: Hash;
      let how: string;
      if (payMyself || !net.gasless) {
        setBusy({ skillId, step: "Confirm in MetaMask…" });
        hash = await directTx(skillId, "endorse");
        how = "Endorsed from your wallet.";
      } else {
        const nonce = await readContract(config, {
          address: ADDRESS,
          abi: endorsementsAbi,
          functionName: "nonces",
          args: [address],
          chainId: CHAIN_ID,
        });
        const deadline = freshDeadline();
        setBusy({ skillId, step: "Sign in MetaMask (free)…" });
        const signature = await signTypedData(config, {
          domain: endorseDomain(ADDRESS, CHAIN_ID),
          types: endorseTypes,
          primaryType: "Endorse",
          message: { endorser: address, skillId: BigInt(skillId), nonce, deadline },
        });
        setBusy({ skillId, step: "Relaying…" });
        const res = await fetch("/api/endorse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endorser: address, skillId: String(skillId), deadline: String(deadline), signature }),
        });
        const data = (await res.json()) as RelayResponse;
        if (!("hash" in data)) {
          setBusy(null);
          setNotice({ skillId, text: data.error, error: true });
          return;
        }
        hash = data.hash;
        how = "Signed by you, submitted by my relayer. You paid no gas.";
      }

      setBusy({ skillId, step: "Writing to chain…" });
      await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID });
      setNotice({ skillId, text: how, hash });
      await skills.refetch();
    } catch (err) {
      setNotice({ skillId, text: explain(err), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(skillId: number) {
    if (!ADDRESS || !address) return;
    setNotice(null);
    try {
      setBusy({ skillId, step: `Switching to ${net.label}…` });
      await ensureChain();
      setBusy({ skillId, step: "Confirm in MetaMask…" });
      const hash = await directTx(skillId, "unendorse");
      setBusy({ skillId, step: "Writing to chain…" });
      await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID });
      setNotice({ skillId, text: "Endorsement withdrawn.", hash });
      await skills.refetch();
    } catch (err) {
      setNotice({ skillId, text: explain(err), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="dash px" aria-labelledby="en-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="en-title">
          Endorsements · {net?.label ?? "Base"}
        </p>
        {ADDRESS && (
          <a
            className="t-mono l-muted"
            href={`${EXPLORER}/address/${ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Contract {shortAddress(ADDRESS)} ↗
          </a>
        )}
      </div>

      {NETWORKS.length > 1 && (
        <div className="en-nets t-mono" role="tablist" aria-label="Endorsement network">
          {NETWORKS.map((n) => (
            <button
              key={n.key}
              type="button"
              role="tab"
              aria-selected={n.key === net?.key}
              className={`btn ${n.key === net?.key ? "" : "btn-ghost"} t-mono`}
              disabled={!!busy}
              onClick={() => {
                setNetKey(n.key);
                setNotice(null);
              }}
            >
              {n.label}
            </button>
          ))}
        </div>
      )}

      <div className="ap-intro">
        {net?.gasless ? (
          <>
            <p className="t-next">Vouch for a skill, gas-free.</p>
            <p className="t-body c-muted">
              You sign a typed message in MetaMask, which costs nothing. My relayer checks the signature and puts it
              on-chain, paying the gas. The contract binds each signature to this chain, this contract and a single-use
              nonce with a 30 minute deadline, so it cannot be replayed.
            </p>
          </>
        ) : (
          <>
            <p className="t-next">Vouch for a skill on Base mainnet.</p>
            <p className="t-body c-muted">
              A real on-chain endorsement from your wallet; gas on Base is usually a fraction of a cent. Want to see the
              gas-free EIP-712 flow? Switch to the Base Sepolia demo above.
            </p>
          </>
        )}
      </div>

      {!net || !ADDRESS ? (
        <p className="t-mono notice">Contract deployment in progress. Check back soon.</p>
      ) : skills.isPending ? (
        <p className="t-mono c-muted">Reading skills…</p>
      ) : skills.isError ? (
        <p className="t-mono notice">Could not read endorsements right now.</p>
      ) : (
        <>
          <p className="t-mono c-muted">{total} endorsements on-chain</p>
          <ul className="en-list">
            {skills.data.map((s) => {
              const isBusy = busy?.skillId === s.id;
              return (
                <li key={s.id} className="en-item">
                  <div className="en-row">
                    <span className="t-role">{s.name}</span>
                    <span className="t-mono c-muted en-count">{s.count}</span>
                    <div className="en-actions">
                      {!connected ? (
                        <span className="t-mono c-muted">Connect wallet</span>
                      ) : s.mine ? (
                        <>
                          <span className="t-mono en-mine">Endorsed</span>
                          <button className="btn btn-ghost t-mono" type="button" disabled={!!busy} onClick={() => withdraw(s.id)}>
                            {isBusy ? busy.step : "Withdraw"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn t-mono" type="button" disabled={!!busy} onClick={() => endorse(s.id)}>
                            {isBusy ? busy.step : "Endorse"}
                          </button>
                          {!isBusy && net.gasless && (
                            <button className="en-alt t-mono l-muted" type="button" disabled={!!busy} onClick={() => endorse(s.id, true)}>
                              Pay gas myself
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {notice?.skillId === s.id && (
                    <p className={`t-mono en-note ${notice.error ? "notice" : "c-muted"}`}>
                      {notice.text}{" "}
                      {notice.hash && (
                        <a className="l-underline" href={`${EXPLORER}/tx/${notice.hash}`} target="_blank" rel="noopener noreferrer">
                          View transaction ↗
                        </a>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

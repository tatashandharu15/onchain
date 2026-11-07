"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, UserRejectedRequestError } from "viem";
import { useConfig, useConnection } from "wagmi";
import { readContract, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { BADGE_ADDRESS, badgeAbi, badgeImageFromTokenUri } from "@/lib/badge";
import { shortAddress } from "@/lib/format";
import { GUESTBOOK_ADDRESS, GUESTBOOK_CHAIN, GUESTBOOK_EXPLORER, guestbookAbi } from "@/lib/guestbook";

function explain(err: unknown) {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in your wallet.";
    if (/insufficient funds/i.test(err.message)) return "You need a little ETH on this network for gas.";
    return err.shortMessage;
  }
  return "Something went wrong.";
}

/** Soulbound badge for guestbook signers: mint once, displayed straight from on-chain SVG metadata. */
export function VisitorBadge() {
  const config = useConfig();
  const { address, status, chainId } = useConnection();
  const connected = status === "connected" && !!address;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["badge", BADGE_ADDRESS, address ?? null],
    enabled: !!BADGE_ADDRESS && !!GUESTBOOK_ADDRESS,
    refetchInterval: 30_000,
    queryFn: async () => {
      const chain = GUESTBOOK_CHAIN.id;
      const total = await readContract(config, { address: BADGE_ADDRESS!, abi: badgeAbi, functionName: "totalMinted", chainId: chain });
      if (!address) return { total, signed: false, tokenId: 0n, image: null as string | null };
      const [signedAt, tokenId] = await Promise.all([
        readContract(config, { address: GUESTBOOK_ADDRESS!, abi: guestbookAbi, functionName: "lastSignedAt", args: [address], chainId: chain }),
        readContract(config, { address: BADGE_ADDRESS!, abi: badgeAbi, functionName: "badgeOf", args: [address], chainId: chain }),
      ]);
      let image: string | null = null;
      if (tokenId > 0n) {
        const uri = await readContract(config, { address: BADGE_ADDRESS!, abi: badgeAbi, functionName: "tokenURI", args: [tokenId], chainId: chain });
        image = badgeImageFromTokenUri(uri);
      }
      return { total, signed: signedAt > 0n, tokenId, image };
    },
  });

  async function mint() {
    if (!BADGE_ADDRESS || !address) return;
    setError(null);
    try {
      if (chainId !== GUESTBOOK_CHAIN.id) {
        setBusy("Switching network…");
        await switchChain(config, { chainId: GUESTBOOK_CHAIN.id });
      }
      const { request } = await simulateContract(config, {
        account: address,
        address: BADGE_ADDRESS,
        abi: badgeAbi,
        functionName: "mint",
        chainId: GUESTBOOK_CHAIN.id,
      });
      setBusy("Confirm in MetaMask…");
      const hash = await writeContract(config, request);
      setBusy("Minting…");
      await waitForTransactionReceipt(config, { hash, chainId: GUESTBOOK_CHAIN.id });
      await state.refetch();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(null);
    }
  }

  if (!BADGE_ADDRESS) return null;
  const d = state.data;

  return (
    <section className="dash px" aria-labelledby="vb-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="vb-title">
          Visitor badge · soulbound NFT
        </p>
        <a className="t-mono l-muted" href={`${GUESTBOOK_EXPLORER}/token/${BADGE_ADDRESS}`} target="_blank" rel="noopener noreferrer">
          {d ? `${d.total.toString()} minted · ` : ""}Contract {shortAddress(BADGE_ADDRESS)} ↗
        </a>
      </div>
      <div className="vb-grid">
        <div className="ap-intro">
          <p className="t-next">Signed the guestbook? Claim your badge.</p>
          <p className="t-body c-muted">
            A non-transferable ERC-721 (ERC-5192) with artwork and metadata stored fully on-chain. The contract checks the
            guestbook itself, so only addresses that left a message can mint, once each.
          </p>
          {!connected ? (
            <p className="t-mono c-muted">Connect a wallet to check eligibility.</p>
          ) : state.isPending ? (
            <p className="t-mono c-muted">Checking…</p>
          ) : state.isError || !d ? (
            <p className="t-mono notice">Could not read the badge contract right now.</p>
          ) : d.tokenId > 0n ? (
            <p className="t-mono en-mine">You hold badge #{d.tokenId.toString()}.</p>
          ) : !d.signed ? (
            <p className="t-mono c-muted">Leave a guestbook message above to unlock your badge.</p>
          ) : (
            <div>
              <button className="btn t-mono" type="button" disabled={!!busy} onClick={mint}>
                {busy ?? "Mint my badge"}
              </button>
            </div>
          )}
          {error && <p className="t-mono notice">{error}</p>}
        </div>
        {d?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="vb-art" src={d.image} alt={`Onchain Visitor badge #${d.tokenId.toString()}`} width={400} height={400} />
        )}
      </div>
    </section>
  );
}

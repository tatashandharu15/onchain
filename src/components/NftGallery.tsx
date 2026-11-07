"use client";

import { useState } from "react";
import type { Address } from "viem";
import type { ChainNfts, Discovery } from "@/lib/assets";
import { shortAddress } from "@/lib/format";
import { CHAINS, chainMeta } from "@/lib/tokens";

const INITIAL = 12;

/** NFTs discovered via Alchemy's NFT API. Images are https-only and loaded without a referrer. */
export function NftGallery({ owner, items, discovery }: { owner: Address; items: ChainNfts[]; discovery: Discovery | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const all = items.flatMap((c) => c.nfts.map((n) => ({ ...n, chainId: c.chainId })));
  const shown = expanded ? all : all.slice(0, INITIAL);
  const total = items.reduce((s, c) => s + c.total, 0);
  const missing = discovery?.configured
    ? CHAINS.filter((c) => {
        const d = discovery.byChain[c.id];
        return !d || d.status !== "ok" || d.nfts === null;
      })
    : [];

  return (
    <section className="dash px" aria-labelledby="nft-title">
      <div className="dash-head">
        <p className="t-mono c-muted" id="nft-title">
          NFTs · {shortAddress(owner)}
        </p>
        <span className="t-mono c-muted">{total} found</span>
      </div>

      {all.length === 0 ? (
        <p className="t-body c-muted">No NFTs found on the chains that could be scanned.</p>
      ) : (
        <>
          <ul className="nft-grid">
            {shown.map((n) => {
              const meta = chainMeta(n.chainId);
              return (
                <li key={`${n.chainId}-${n.contract}-${n.tokenId}`} className="nft-card">
                  <a href={`${meta?.explorer}/token/${n.contract}?a=${n.tokenId}`} target="_blank" rel="noopener noreferrer">
                    {n.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.image} alt={n.name} loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="nft-empty t-mono c-muted">No image</div>
                    )}
                  </a>
                  <p className="t-body nft-name">{n.name}</p>
                  <p className="t-mono c-muted nft-meta">
                    {n.collection} · {meta?.name}
                  </p>
                </li>
              );
            })}
          </ul>
          {all.length > INITIAL && (
            <button className="btn btn-ghost t-mono" type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer" : `Show all ${all.length}`}
            </button>
          )}
        </>
      )}
      <p className="t-mono c-muted ap-foot">
        Spam collections are filtered where Alchemy supports it; up to 24 per chain are shown.
        {missing.length > 0 && ` NFTs on ${missing.map((c) => c.name).join(", ")} are not covered yet.`}
      </p>
    </section>
  );
}

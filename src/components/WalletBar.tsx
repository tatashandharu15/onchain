"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { chainMeta } from "@/lib/tokens";
import { shortAddress } from "@/lib/format";

const noop = () => () => {};

export function WalletBar() {
  const { address, status, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const { data: ens } = useEnsName({ address, chainId: mainnet.id, query: { enabled: !!address } });

  // Prefer MetaMask announced via EIP-6963; fall back to any injected wallet.
  const metamask = connectors.find((c) => c.id === "io.metamask") ?? connectors.find((c) => c.type === "injected" && c.id !== "injected");
  const hasInjected = useSyncExternalStore(
    noop,
    () => typeof (window as { ethereum?: unknown }).ethereum !== "undefined",
    () => true,
  );
  const fallback = hasInjected ? connectors.find((c) => c.id === "injected") : undefined;
  const target = metamask ?? fallback;

  // Main site's "Connect MetaMask" links here with ?connect=1: open the wallet prompt once, then clean the URL.
  // MetaMask announces itself via EIP-6963 shortly after load, so this waits for the connector to appear.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !target || status !== "disconnected") return;
    if (!metamask && typeof (window as { ethereum?: unknown }).ethereum === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("connect") !== "1") return;
    autoTried.current = true;
    url.searchParams.delete("connect");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    connect.mutate({ connector: target });
  }, [target, metamask, status, connect]);

  if (status === "connected" && address) {
    return (
      <div className="wallet">
        <span className="wallet-dot" aria-hidden />
        <div className="wallet-id">
          <span className="t-body">{ens ?? shortAddress(address)}</span>
          <span className="t-mono c-muted">{chainMeta(chainId ?? 0)?.name ?? `Chain ${chainId}`}</span>
        </div>
        <button type="button" className="btn btn-ghost t-mono" onClick={() => disconnect.mutate()}>
          Disconnect
        </button>
      </div>
    );
  }

  const busy = connect.isPending || status === "connecting" || status === "reconnecting";
  return (
    <div className="wallet">
      {target ? (
        <button type="button" className="btn t-mono" disabled={busy} onClick={() => connect.mutate({ connector: target })}>
          {busy ? "Check your wallet…" : metamask ? `Connect ${metamask.name}` : "Connect wallet"}
        </button>
      ) : (
        <a className="btn t-mono" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
          Install MetaMask
        </a>
      )}
      {connect.error && <span className="t-mono wallet-err">{connect.error.message.split("\n")[0]}</span>}
    </div>
  );
}

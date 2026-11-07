"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useConfig, useConnection } from "wagmi";
import { signMessage } from "wagmi/actions";
import type { SessionResponse } from "@/app/api/auth/session/route";

export const SESSION_KEY = ["session"] as const;

/** Sign-In with Ethereum session state, shared through React Query. */
export function useSession() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const { address, chainId } = useConnection();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: SESSION_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<SessionResponse> => {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      return res.json();
    },
  });

  const data = query.data;
  // A session only counts for the wallet that is connected right now.
  const signedIn = !!data?.address && !!address && data.address.toLowerCase() === address.toLowerCase();

  async function signIn() {
    if (!address || !chainId) return;
    setPending(true);
    setError(null);
    try {
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const nonceBody = await nonceRes.json();
      if (!nonceRes.ok) throw new Error(nonceBody.error ?? "Sign-in is unavailable.");
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Onchain. This does not send a transaction or cost gas.",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce: nonceBody.nonce,
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });
      const signature = await signMessage(config, { message });
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign-in failed.");
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed.";
      setError(/reject|denied/i.test(msg) ? "Request rejected in your wallet." : msg.split("\n")[0]);
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  }

  return {
    configured: data?.configured ?? false,
    signedIn,
    isOwner: signedIn && !!data?.isOwner,
    pending,
    error,
    signIn,
    signOut,
  };
}

import { NextResponse, type NextRequest } from "next/server";
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS_CHAIN, GASLESS_CHAIN } from "@/lib/contracts";
import { ENDORSEMENTS_ADDRESS, GASLESS_ENDORSEMENTS_ADDRESS, endorsementsAbi } from "@/lib/endorsements";
import { GUESTBOOK_ADDRESS, guestbookAbi } from "@/lib/guestbook";
import { serverClient, siteOwner } from "@/lib/serverChain";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export type AdminStatus = {
  owner: `0x${string}`;
  relayer: { address: `0x${string}`; balanceEth: string; low: boolean } | null;
  config: {
    etherscan: boolean;
    blockscout: boolean;
    relayer: boolean;
    guestbook: boolean;
    endorsements: boolean;
    gaslessEndorsements: boolean;
  };
  chain: string;
  guestbook: { total: number; hidden: number } | null;
  endorsements: { skills: number; total: number } | null;
};

/** Owner-only operational status. Requires a SIWE session whose address owns the Guestbook contract. */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers });
  const owner = await siteOwner();
  if (!owner || owner.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Owner only." }, { status: 403, headers });
  }

  const client = serverClient(CONTRACTS_CHAIN.id);
  const testnet = serverClient(GASLESS_CHAIN.id);
  const rawKey = (process.env.RELAYER_PRIVATE_KEY ?? "").trim();
  const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  const relayerOk = /^0x[0-9a-fA-F]{64}$/.test(key);

  const [relayer, guestbook, endorsements] = await Promise.all([
    (async () => {
      if (!relayerOk) return null;
      const address = privateKeyToAccount(key as `0x${string}`).address;
      const bal = await testnet.getBalance({ address }).catch(() => null);
      if (bal === null) return null;
      return { address, balanceEth: formatEther(bal), low: bal < 200_000_000_000_000n };
    })(),
    (async () => {
      if (!GUESTBOOK_ADDRESS) return null;
      try {
        const total = await client.readContract({ address: GUESTBOOK_ADDRESS, abi: guestbookAbi, functionName: "count" });
        const page = await client.readContract({
          address: GUESTBOOK_ADDRESS,
          abi: guestbookAbi,
          functionName: "getEntries",
          args: [0n, total < 500n ? total : 500n],
        });
        return { total: Number(total), hidden: page.filter((e) => e.hidden).length };
      } catch {
        return null;
      }
    })(),
    (async () => {
      if (!ENDORSEMENTS_ADDRESS) return null;
      try {
        const [names, counts] = await client.readContract({
          address: ENDORSEMENTS_ADDRESS,
          abi: endorsementsAbi,
          functionName: "getSkills",
          args: [owner],
        });
        return { skills: names.length, total: counts.reduce((s, c) => s + Number(c), 0) };
      } catch {
        return null;
      }
    })(),
  ]);

  const body: AdminStatus = {
    owner,
    relayer,
    config: {
      etherscan: !!process.env.ETHERSCAN_API_KEY,
      blockscout: !!process.env.BLOCKSCOUT_API_KEY,
      relayer: relayerOk,
      guestbook: !!GUESTBOOK_ADDRESS,
      endorsements: !!ENDORSEMENTS_ADDRESS,
      gaslessEndorsements: !!GASLESS_ENDORSEMENTS_ADDRESS,
    },
    chain: CONTRACTS_CHAIN.name,
    guestbook,
    endorsements,
  };
  return NextResponse.json(body, { headers });
}

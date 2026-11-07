import type { NextRequest } from "next/server";
import { createPublicClient, createWalletClient, formatEther, http, isAddress, isHex, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ENDORSEMENTS_ADDRESS,
  ENDORSEMENTS_CHAIN,
  SIGNATURE_TTL_SECONDS,
  endorseDomain,
  endorseTypes,
  endorsementsAbi,
  type RelayRequest,
  type RelayResponse,
} from "@/lib/endorsements";

/**
 * Gasless endorsements: the visitor signs EIP-712 typed data in their wallet (free), this route checks the
 * signature and submits it on-chain with a testnet relayer wallet that pays the gas.
 *
 * The relayer only ever calls endorseBySig on the one configured contract, and only after:
 *  - every field is validated and the deadline is no more than SIGNATURE_TTL_SECONDS away,
 *  - the signature verifies off-chain against the current nonce (EOA or ERC-1271 smart account),
 *  - the endorsement does not already exist,
 *  - a dry run (simulate) succeeds.
 * A basic per-IP limit and a minimum relayer balance keep a spammer from draining it.
 */

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || undefined;
const MIN_RELAYER_BALANCE = parseEther("0.0002");
const LIMIT_PER_HOUR = 10;

// Best effort only: serverless instances do not share memory. The contract itself caps one endorsement per
// (address, skill), so this mainly slows down scripted abuse from a single client.
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT_PER_HOUR;
}

const json = (body: RelayResponse, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !ENDORSEMENTS_ADDRESS || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return json({ error: "Relayer is not configured.", relay: false }, 503);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return json({ error: "Too many endorsements from this connection. Try again later." }, 429);

  let body: RelayRequest;
  try {
    body = (await request.json()) as RelayRequest;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { endorser, signature } = body;
  if (!isAddress(endorser)) return json({ error: "Invalid endorser address." }, 400);
  if (!isHex(signature) || signature.length < 132 || signature.length > 4096) {
    return json({ error: "Invalid signature format." }, 400);
  }
  if (!/^\d{1,4}$/.test(String(body.skillId)) || !/^\d{1,12}$/.test(String(body.deadline))) {
    return json({ error: "Invalid skill or deadline." }, 400);
  }
  const skillId = BigInt(body.skillId);
  const deadline = BigInt(body.deadline);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline < now) return json({ error: "Signature expired. Please sign again." }, 400);
  if (deadline > now + BigInt(SIGNATURE_TTL_SECONDS + 60)) return json({ error: "Deadline too far in the future." }, 400);

  const publicClient = createPublicClient({ chain: ENDORSEMENTS_CHAIN, transport: http(RPC) });
  const contract = { address: ENDORSEMENTS_ADDRESS, abi: endorsementsAbi } as const;

  try {
    const [nonce, already, skillCount] = await Promise.all([
      publicClient.readContract({ ...contract, functionName: "nonces", args: [endorser] }),
      publicClient.readContract({ ...contract, functionName: "hasEndorsed", args: [endorser, skillId] }),
      publicClient.readContract({ ...contract, functionName: "skillCount" }),
    ]);
    if (skillId >= skillCount) return json({ error: "Unknown skill." }, 400);
    if (already) return json({ error: "You already endorsed this skill." }, 409);

    // Off-chain check first so invalid signatures never cost the relayer anything.
    const valid = await publicClient.verifyTypedData({
      address: endorser,
      domain: endorseDomain(ENDORSEMENTS_ADDRESS),
      types: endorseTypes,
      primaryType: "Endorse",
      message: { endorser, skillId, nonce, deadline },
      signature,
    });
    if (!valid) return json({ error: "Signature does not match this endorsement." }, 400);

    const account = privateKeyToAccount(key as `0x${string}`);
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < MIN_RELAYER_BALANCE) {
      return json({ error: `Relayer is out of test ETH (${formatEther(balance)} left). Use "Pay gas myself".`, relay: false }, 503);
    }

    const { request: tx } = await publicClient.simulateContract({
      ...contract,
      account,
      functionName: "endorseBySig",
      args: [endorser, skillId, deadline, signature],
    });
    const wallet = createWalletClient({ account, chain: ENDORSEMENTS_CHAIN, transport: http(RPC) });
    const hash = await wallet.writeContract(tx);
    return json({ hash });
  } catch {
    return json({ error: "Could not submit the endorsement right now." }, 502);
  }
}

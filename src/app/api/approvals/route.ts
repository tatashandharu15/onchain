import type { NextRequest } from "next/server";
import { getAddress, isAddress, pad, type Address } from "viem";
import { CHAINS } from "@/lib/tokens";

/**
 * Finds approval *candidates* for an owner on one chain by scanning Approval / ApprovalForAll logs
 * through Etherscan API V2. The browser then checks each candidate's current allowance on-chain,
 * so this route only needs to say "this owner once approved this spender on this contract".
 *
 * Privacy: the address passes through this route to Etherscan and back. Nothing is logged, cached
 * server-side or stored. The Etherscan key never reaches the browser.
 */

const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const APPROVAL_FOR_ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";
// Overridable for local tests only.
const ETHERSCAN_API = process.env.ETHERSCAN_API_URL || "https://api.etherscan.io/v2/api";
const MAX_PAGES = 3; // 3 × 1000 logs per event type
const ALLOWED_CHAINS = new Set(CHAINS.map((c) => c.id));

export type ApprovalCandidate = {
  kind: "erc20" | "nft-all";
  token: Address;
  spender: Address;
  lastBlock: number;
  lastTimestamp: number;
};

export type ApprovalsResponse =
  | { status: "ok"; chainId: number; candidates: ApprovalCandidate[]; truncated: boolean }
  | { status: "unavailable"; chainId: number; reason: string };

type EtherscanLog = { address: string; topics: string[]; data: string; blockNumber: string; timeStamp: string };
type EtherscanResult = { status: string; message: string; result: EtherscanLog[] | string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function etherscanLogs(chainId: number, topic0: string, owner: Address, page: number, key: string) {
  const qs = new URLSearchParams({
    chainid: String(chainId),
    module: "logs",
    action: "getLogs",
    fromBlock: "0",
    toBlock: "latest",
    topic0,
    topic1: pad(owner),
    topic0_1_opr: "and",
    page: String(page),
    offset: "1000",
    apikey: key,
  });
  // Free tier allows 3 calls/second; retry a couple of times on rate limiting.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${ETHERSCAN_API}?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    const json = (await res.json()) as EtherscanResult;
    if (Array.isArray(json.result)) return json.result;
    const msg = String(json.result ?? json.message ?? "");
    if (/no records found/i.test(json.message) || /no records found/i.test(msg)) return [];
    if (/rate limit/i.test(msg)) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    // Plan restrictions ("not supported for this chain on the Free tier", "upgrade", etc.)
    // "coverage" = the data source does not cover this chain; the UI phrases it neutrally.
    const reason = /upgrade|not supported|paid|plan/i.test(msg) ? "coverage" : msg || json.message || "Etherscan error";
    throw Object.assign(new Error(reason), { unavailable: true });
  }
  throw Object.assign(new Error("Etherscan rate limit, try again shortly."), { unavailable: true });
}

async function scan(chainId: number, topic0: string, owner: Address, key: string) {
  const logs: EtherscanLog[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await etherscanLogs(chainId, topic0, owner, page, key);
    logs.push(...batch);
    if (batch.length < 1000) break;
    if (page === MAX_PAGES) truncated = true;
    await sleep(350);
  }
  return { logs, truncated };
}

export async function GET(request: NextRequest) {
  const key = process.env.ETHERSCAN_API_KEY;
  const params = request.nextUrl.searchParams;
  const owner = params.get("address") ?? "";
  const chainId = Number(params.get("chain"));

  if (!isAddress(owner)) return Response.json({ error: "Invalid address" }, { status: 400 });
  if (!ALLOWED_CHAINS.has(chainId)) return Response.json({ error: "Unsupported chain" }, { status: 400 });

  const headers = { "Cache-Control": "private, no-store" };
  if (!key) {
    const body: ApprovalsResponse = { status: "unavailable", chainId, reason: "Approval scanner is not configured." };
    return Response.json(body, { headers });
  }

  try {
    const ownerAddr = getAddress(owner);
    const erc20 = await scan(chainId, APPROVAL, ownerAddr, key);
    await sleep(350);
    const nft = await scan(chainId, APPROVAL_FOR_ALL, ownerAddr, key);

    const map = new Map<string, ApprovalCandidate>();
    const add = (kind: ApprovalCandidate["kind"], log: EtherscanLog) => {
      const spenderTopic = log.topics[2];
      if (!spenderTopic) return;
      const token = getAddress(log.address);
      const spender = getAddress(`0x${spenderTopic.slice(-40)}`);
      const k = `${kind}:${token}:${spender}`;
      const block = Number(log.blockNumber);
      const ts = Number(log.timeStamp);
      const prev = map.get(k);
      if (!prev || block > prev.lastBlock) map.set(k, { kind, token, spender, lastBlock: block, lastTimestamp: ts });
    };
    // ERC-20 Approval has 3 topics (value in data). ERC-721 Approval has 4 (tokenId indexed); single-token
    // NFT approvals reset on transfer, so they are skipped here.
    for (const log of erc20.logs) if (log.topics.length === 3) add("erc20", log);
    for (const log of nft.logs) if (log.topics.length === 3) add("nft-all", log);

    const body: ApprovalsResponse = {
      status: "ok",
      chainId,
      candidates: [...map.values()].sort((a, b) => b.lastBlock - a.lastBlock),
      truncated: erc20.truncated || nft.truncated,
    };
    return Response.json(body, { headers });
  } catch (err) {
    const reason =
      err instanceof Error && "unavailable" in err ? err.message : "Approval data is temporarily unavailable.";
    const body: ApprovalsResponse = { status: "unavailable", chainId, reason };
    return Response.json(body, { headers });
  }
}

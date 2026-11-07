import { erc20Abi, formatUnits, maxUint256, type Address, type ContractFunctionParameters } from "viem";
import { getPublicClient } from "wagmi/actions";
import type { ApprovalCandidate, ApprovalsResponse } from "@/app/api/approvals/route";
import { config } from "./wagmi";

export const nftApprovalAbi = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** approve() without a return value, so tokens like USDT that return nothing still work. */
export const approveNoReturnAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** Contracts that are the same address on every chain and widely trusted. Anything else is shown raw. */
const KNOWN_SPENDERS: Record<string, string> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
  "0x1e0049783f008a0085193e00003d00cd54003c71": "OpenSea Conduit",
};

export type ActiveApproval = ApprovalCandidate & {
  chainId: number;
  label: string;
  /** ERC-20: formatted amount, or "Unlimited". NFT: "All items". */
  amount: string;
  unlimited: boolean;
  spenderLabel: string | null;
  spenderIsContract: boolean;
};

export type ChainApprovals =
  | { chainId: number; status: "ok"; items: ActiveApproval[]; truncated: boolean }
  | { chainId: number; status: "unavailable"; reason: string };

const UNLIMITED_THRESHOLD = maxUint256 / 2n;

export async function loadChainApprovals(owner: Address, chainId: number): Promise<ChainApprovals> {
  const res = await fetch(`/api/approvals?address=${owner}&chain=${chainId}`, { cache: "no-store" });
  if (!res.ok) return { chainId, status: "unavailable", reason: `Scanner error (${res.status}).` };
  const data = (await res.json()) as ApprovalsResponse;
  if (data.status !== "ok") return { chainId, status: "unavailable", reason: data.reason };
  if (data.candidates.length === 0) return { chainId, status: "ok", items: [], truncated: false };

  const client = getPublicClient(config, { chainId: chainId as (typeof config.chains)[number]["id"] });
  const contracts: ContractFunctionParameters[] = data.candidates.flatMap((c): ContractFunctionParameters[] =>
    c.kind === "erc20"
      ? ([
          { address: c.token, abi: erc20Abi, functionName: "allowance", args: [owner, c.spender] },
          { address: c.token, abi: erc20Abi, functionName: "decimals" },
          { address: c.token, abi: erc20Abi, functionName: "symbol" },
        ])
      : ([
          { address: c.token, abi: nftApprovalAbi, functionName: "isApprovedForAll", args: [owner, c.spender] },
          { address: c.token, abi: nftApprovalAbi, functionName: "name" },
          { address: c.token, abi: nftApprovalAbi, functionName: "name" },
        ]),
  );
  const results = await client.multicall({ allowFailure: true, contracts });

  const spenders = [...new Set(data.candidates.map((c) => c.spender))];
  const codes = await Promise.all(spenders.map((s) => client.getCode({ address: s }).catch(() => undefined)));
  const isContract = new Map(spenders.map((s, i) => [s, !!codes[i] && codes[i] !== "0x"]));

  const items: ActiveApproval[] = [];
  data.candidates.forEach((c, i) => {
    const [r0, r1, r2] = [results[i * 3], results[i * 3 + 1], results[i * 3 + 2]];
    const spenderLabel = KNOWN_SPENDERS[c.spender.toLowerCase()] ?? null;
    const base = { ...c, chainId, spenderLabel, spenderIsContract: isContract.get(c.spender) ?? false };
    if (c.kind === "erc20") {
      if (r0.status !== "success") return;
      const allowance = r0.result as bigint;
      if (allowance === 0n) return;
      const decimals = r1.status === "success" ? Number(r1.result) : 18;
      const symbol = r2.status === "success" ? String(r2.result) : "Unknown token";
      const unlimited = allowance >= UNLIMITED_THRESHOLD;
      const amount = unlimited
        ? "Unlimited"
        : new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(Number(formatUnits(allowance, decimals)));
      items.push({ ...base, label: symbol, amount, unlimited });
    } else {
      if (r0.status !== "success" || r0.result !== true) return;
      const name = r1.status === "success" ? String(r1.result) : "NFT collection";
      items.push({ ...base, label: name, amount: "All items", unlimited: true });
    }
  });

  // Riskiest first: spender that is not a contract, then unlimited, then most recent.
  items.sort(
    (a, b) =>
      Number(a.spenderIsContract) - Number(b.spenderIsContract) ||
      Number(b.unlimited) - Number(a.unlimited) ||
      b.lastBlock - a.lastBlock,
  );
  return { chainId, status: "ok", items, truncated: data.truncated };
}

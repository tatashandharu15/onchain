import { isAddress, type Address } from "viem";
import { GUESTBOOK_CHAIN } from "./guestbook";

export { endorsementsAbi } from "./endorsementsAbi";

/** Same testnet as the guestbook. */
export const ENDORSEMENTS_CHAIN = GUESTBOOK_CHAIN;

const raw = process.env.NEXT_PUBLIC_ENDORSEMENTS_ADDRESS;
/** Null until the contract is deployed and NEXT_PUBLIC_ENDORSEMENTS_ADDRESS is set. */
export const ENDORSEMENTS_ADDRESS: Address | null = raw && isAddress(raw) ? raw : null;

/** How long a signed endorsement stays valid. The relayer refuses anything further out. */
export const SIGNATURE_TTL_SECONDS = 30 * 60;

/** Deadline for a signature created now. */
export const freshDeadline = () => BigInt(Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS);

/** Must match the EIP712(name, version) in Endorsements.sol and its ENDORSE_TYPEHASH. */
export const endorseTypes = {
  Endorse: [
    { name: "endorser", type: "address" },
    { name: "skillId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function endorseDomain(verifyingContract: Address) {
  return {
    name: "Tatas Onchain Endorsements",
    version: "1",
    chainId: ENDORSEMENTS_CHAIN.id,
    verifyingContract,
  } as const;
}

export type RelayRequest = { endorser: Address; skillId: string; deadline: string; signature: `0x${string}` };
export type RelayResponse = { hash: `0x${string}` } | { error: string; relay?: false };

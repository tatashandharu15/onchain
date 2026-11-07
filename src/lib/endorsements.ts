import { isAddress, type Address } from "viem";
import { CONTRACTS_CHAIN, GASLESS_CHAIN, IS_MAINNET } from "./contracts";

export { endorsementsAbi } from "./endorsementsAbi";

const addr = (v: string | undefined): Address | null => (v && isAddress(v) ? v : null);

/** Main deployment, on the same chain as the guestbook (mainnet or testnet). */
export const ENDORSEMENTS_CHAIN = CONTRACTS_CHAIN;
/** Null until the contract is deployed and NEXT_PUBLIC_ENDORSEMENTS_ADDRESS is set. */
export const ENDORSEMENTS_ADDRESS = addr(process.env.NEXT_PUBLIC_ENDORSEMENTS_ADDRESS);

/**
 * The deployment the gas-free relayer serves. Always on Base Sepolia: on a testnet site it is the main
 * deployment; on a mainnet site it is a separate testnet contract set in NEXT_PUBLIC_GASLESS_ENDORSEMENTS_ADDRESS.
 */
export const GASLESS_ENDORSEMENTS_ADDRESS = IS_MAINNET
  ? addr(process.env.NEXT_PUBLIC_GASLESS_ENDORSEMENTS_ADDRESS)
  : ENDORSEMENTS_ADDRESS;
export { GASLESS_CHAIN };

export type EndorsementNetwork = { key: "main" | "gasless"; label: string; address: Address; chainId: number; gasless: boolean };

/** Networks the endorsement section can switch between. */
export function endorsementNetworks(): EndorsementNetwork[] {
  const out: EndorsementNetwork[] = [];
  if (ENDORSEMENTS_ADDRESS) {
    out.push({
      key: "main",
      label: IS_MAINNET ? "Base" : "Base Sepolia",
      address: ENDORSEMENTS_ADDRESS,
      chainId: CONTRACTS_CHAIN.id,
      gasless: !IS_MAINNET,
    });
  }
  if (IS_MAINNET && GASLESS_ENDORSEMENTS_ADDRESS) {
    out.push({ key: "gasless", label: "Base Sepolia (gas-free demo)", address: GASLESS_ENDORSEMENTS_ADDRESS, chainId: GASLESS_CHAIN.id, gasless: true });
  }
  return out;
}

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

export function endorseDomain(verifyingContract: Address, chainId: number) {
  return {
    name: "Tatas Onchain Endorsements",
    version: "1",
    chainId,
    verifyingContract,
  } as const;
}

export type RelayRequest = { endorser: Address; skillId: string; deadline: string; signature: `0x${string}` };
export type RelayResponse = { hash: `0x${string}` } | { error: string; relay?: false };

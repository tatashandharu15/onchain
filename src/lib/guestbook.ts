import { isAddress, type Address } from "viem";
import { CONTRACTS_CHAIN, CONTRACTS_EXPLORER } from "./contracts";

export { guestbookAbi } from "./guestbookAbi";

export const GUESTBOOK_CHAIN = CONTRACTS_CHAIN;
export const GUESTBOOK_EXPLORER = CONTRACTS_EXPLORER;
export const MAX_MESSAGE_BYTES = 140;
export const PAGE_SIZE = 20n;
// Mirrors Guestbook.COOLDOWN (1 hours).
export const COOLDOWN_SECONDS = 3600;

const raw = process.env.NEXT_PUBLIC_GUESTBOOK_ADDRESS;
/** Null until the contract is deployed and NEXT_PUBLIC_GUESTBOOK_ADDRESS is set. */
export const GUESTBOOK_ADDRESS: Address | null = raw && isAddress(raw) ? raw : null;

const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

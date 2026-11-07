import { isAddress, type Address } from "viem";

export { badgeAbi } from "./badgeAbi";

const raw = process.env.NEXT_PUBLIC_BADGE_ADDRESS;
/** Null until VisitorBadge is deployed and NEXT_PUBLIC_BADGE_ADDRESS is set. Lives on the guestbook's chain. */
export const BADGE_ADDRESS: Address | null = raw && isAddress(raw) ? raw : null;

/** Decodes the contract's on-chain data:application/json;base64 tokenURI and returns its SVG image as a data URI. */
export function badgeImageFromTokenUri(uri: string): string | null {
  try {
    const prefix = "data:application/json;base64,";
    if (!uri.startsWith(prefix)) return null;
    const json = JSON.parse(atob(uri.slice(prefix.length))) as { image?: string };
    return typeof json.image === "string" && json.image.startsWith("data:image/svg+xml;base64,") ? json.image : null;
  } catch {
    return null;
  }
}

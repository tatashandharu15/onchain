import { NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";
import { NONCE_COOKIE, NONCE_TTL_SECONDS, authConfigured, cookieOptions, signNonce } from "@/lib/session";

/** Issues a fresh single-use nonce, bound to this browser through a signed, httpOnly cookie. */
export async function GET() {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }
  const nonce = generateSiweNonce();
  const res = NextResponse.json({ nonce }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(NONCE_COOKIE, signNonce(nonce), cookieOptions(NONCE_TTL_SECONDS));
  return res;
}

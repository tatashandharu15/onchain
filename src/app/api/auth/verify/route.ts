import { NextResponse, type NextRequest } from "next/server";
import { isHex } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { serverClient, siteOwner, supportedChainIds } from "@/lib/serverChain";
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authConfigured,
  cookieOptions,
  readNonce,
  signSession,
} from "@/lib/session";

/**
 * Verifies an EIP-4361 (Sign-In with Ethereum) message and starts a session.
 * Checks, in order: request shape, the domain is this host, the nonce is the one issued to this browser,
 * the message is fresh, the chain is supported, and the signature (EOA, or smart account via ERC-1271/6492).
 */
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

const fail = (error: string, status = 400) => {
  const res = NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  res.cookies.delete(NONCE_COOKIE); // a failed attempt burns the nonce
  return res;
};

export async function POST(request: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });

  let body: { message?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.");
  }
  const { message, signature } = body;
  if (typeof message !== "string" || message.length > 2000) return fail("Invalid message.");
  if (typeof signature !== "string" || !isHex(signature) || signature.length > 4096) return fail("Invalid signature.");

  const fields = parseSiweMessage(message);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const expectedNonce = readNonce(request.cookies.get(NONCE_COOKIE)?.value);

  if (!fields.address || !fields.domain || !fields.nonce || !fields.chainId || !fields.issuedAt) {
    return fail("Message is missing required fields.");
  }
  if (fields.domain !== host) return fail("Message was created for a different site.");
  if (!expectedNonce || fields.nonce !== expectedNonce) return fail("Sign-in request expired. Please try again.");
  if (Math.abs(Date.now() - fields.issuedAt.getTime()) > MAX_MESSAGE_AGE_MS) return fail("Sign-in message is too old.");
  if (!supportedChainIds.has(fields.chainId)) return fail("Unsupported chain.");

  let valid = false;
  try {
    valid = await verifySiweMessage(serverClient(fields.chainId), {
      message,
      signature,
      domain: host,
      nonce: expectedNonce,
    });
  } catch {
    return fail("Could not verify the signature right now.", 502);
  }
  if (!valid) return fail("Signature does not match the message.", 401);

  const owner = await siteOwner();
  const isOwner = !!owner && owner.toLowerCase() === fields.address.toLowerCase();
  const res = NextResponse.json(
    { address: fields.address, isOwner },
    { headers: { "Cache-Control": "no-store" } },
  );
  res.cookies.delete(NONCE_COOKIE);
  res.cookies.set(SESSION_COOKIE, signSession(fields.address, fields.chainId), cookieOptions(SESSION_TTL_SECONDS));
  return res;
}

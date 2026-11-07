import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address } from "viem";

/**
 * Stateless signed cookies for Sign-In with Ethereum. No database: the payload is JSON, base64url-encoded,
 * followed by an HMAC-SHA256 over it keyed with SESSION_SECRET. Tampering or expiry makes it invalid.
 */

export const NONCE_COOKIE = "siwe_nonce";
export const SESSION_COOKIE = "onchain_session";
export const NONCE_TTL_SECONDS = 10 * 60;
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type Session = { address: Address; chainId: number; exp: number };
type NoncePayload = { nonce: string; exp: number };

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export const authConfigured = () => secret() !== null;

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (data: string, key: string) => createHmac("sha256", key).update(data).digest("base64url");

function sign(payload: object): string {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  const data = b64(JSON.stringify(payload));
  return `${data}.${mac(data, key)}`;
}

function unsign<T extends { exp: number }>(token: string | undefined): T | null {
  const key = secret();
  if (!key || !token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

const now = () => Math.floor(Date.now() / 1000);

export const signNonce = (nonce: string) => sign({ nonce, exp: now() + NONCE_TTL_SECONDS } satisfies NoncePayload);
export const readNonce = (token: string | undefined) => unsign<NoncePayload>(token)?.nonce ?? null;

export const signSession = (address: Address, chainId: number) =>
  sign({ address, chainId, exp: now() + SESSION_TTL_SECONDS } satisfies Session);
export const readSession = (token: string | undefined) => unsign<Session>(token);

export const cookieOptions = (maxAge: number) =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  }) as const;

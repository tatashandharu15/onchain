import { NextResponse, type NextRequest } from "next/server";
import { siteOwner } from "@/lib/serverChain";
import { SESSION_COOKIE, authConfigured, readSession } from "@/lib/session";

export type SessionResponse = { configured: boolean; address: `0x${string}` | null; isOwner: boolean };

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!authConfigured()) {
    return NextResponse.json({ configured: false, address: null, isOwner: false } satisfies SessionResponse, { headers });
  }
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ configured: true, address: null, isOwner: false } satisfies SessionResponse, { headers });
  const owner = await siteOwner();
  const isOwner = !!owner && owner.toLowerCase() === session.address.toLowerCase();
  return NextResponse.json({ configured: true, address: session.address, isOwner } satisfies SessionResponse, { headers });
}

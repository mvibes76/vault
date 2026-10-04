import { NextResponse } from "next/server";
import {
  PROXY_COOKIE,
  securityV2Enabled,
  verifyBearerUser,
  issueProxySession,
  proxyCookieOptions,
} from "@/lib/server/proxy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!securityV2Enabled()) return new NextResponse(null, { status: 204 });

  try {
    const user = await verifyBearerUser(request);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(PROXY_COOKIE, issueProxySession(user.id), proxyCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
}

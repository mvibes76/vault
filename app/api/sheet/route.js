import { NextResponse } from "next/server";
import { safeFetch, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get("id");
  const tab = searchParams.get("tab");

  if (!sheetId || !tab) {
    return NextResponse.json({ error: "Missing id or tab" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(sheetId)) return NextResponse.json({ error: "Invalid sheet id" }, { status: 400 });
  try { await guardProxyRequest(request, "file"); }
  catch (error) { return securityErrorResponse(error, "Sheet unavailable"); }

  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

    const res = await safeFetch(gvizUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeoutMs: 10000,
      maxBytes: MAX_CSV_BYTES,
    });

    if (!res.ok) {
      throw new Error(`Could not fetch tab "${tab}" (${res.status})`);
    }

    const csv = await readTextLimited(res, MAX_CSV_BYTES);

    // If Google returns an HTML error page instead of CSV, catch it
    if (csv.trim().startsWith("<!")) {
      throw new Error(`Tab "${tab}" not found or sheet not public.`);
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return securityErrorResponse(err, "Sheet unavailable");
  }
}

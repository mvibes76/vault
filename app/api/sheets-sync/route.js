import { NextResponse } from "next/server";
import { safeFetch, readTextLimited, validatePublicUrl } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;

// Proxy for Google Apps Script Web App webhook.
// Keeps the webhook URL server-side so it's not exposed in the client bundle.
// Set SHEETS_WEBHOOK_URL in your Vercel environment variables.

export async function POST(request) {
  try { await guardProxyRequest(request, "mutation"); }
  catch (error) { return securityErrorResponse(error, "Sheet mirror unavailable"); }

  const webhookUrl = process.env.SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    // Silently succeed if webhook isn't configured — quick adds still save to Supabase
    return NextResponse.json({ ok: true, skipped: "No webhook configured" });
  }

  try {
    const checked = await validatePublicUrl(webhookUrl);
    if (!checked.ok) return NextResponse.json({ ok: false, error: "Sheet webhook configuration is invalid" }, { status: 503 });

    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_REQUEST_BYTES) return NextResponse.json({ error: "Sync request too large" }, { status: 413 });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return NextResponse.json({ error: "Sync request too large" }, { status: 413 });
    let body;
    try { body = JSON.parse(rawBody || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const res = await safeFetch(checked.url.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 25000,
      maxBytes: MAX_RESPONSE_BYTES,
    });

    const text = await readTextLimited(res, MAX_RESPONSE_BYTES);
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return NextResponse.json({ ok: res.ok, data });
  } catch (err) {
    // Never fail the quick-add flow over a webhook error
    console.error("[sheets-sync] webhook error:", err?.code || err?.name || "error");
    return NextResponse.json({ ok: false, error: "Sheet mirror unavailable" }, { status: 200 });
  }
}

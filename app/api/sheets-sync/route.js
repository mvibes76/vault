import { NextResponse } from "next/server";

// Proxy for Google Apps Script Web App webhook.
// Keeps the webhook URL server-side so it's not exposed in the client bundle.
// Set SHEETS_WEBHOOK_URL in your Vercel environment variables.

export async function POST(request) {
  const webhookUrl = process.env.SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    // Silently succeed if webhook isn't configured — quick adds still save to Supabase
    return NextResponse.json({ ok: true, skipped: "No webhook configured" });
  }

  try {
    const body = await request.json();

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return NextResponse.json({ ok: res.ok, data });
  } catch (err) {
    // Never fail the quick-add flow over a webhook error
    console.error("[sheets-sync] webhook error:", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}

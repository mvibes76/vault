import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    sheetWebhookConfigured: Boolean(process.env.SHEETS_WEBHOOK_URL),
    mediaRelayMaxBytes: Number(process.env.MEDIA_RELAY_MAX_BYTES || 512 * 1024 * 1024),
    runtime: "next-api",
  });
}

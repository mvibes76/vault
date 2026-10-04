"use client";
import { supabase } from "@/lib/supabase";

export const SECURITY_V2_ENABLED = process.env.NEXT_PUBLIC_VAULT_SECURITY_V2 === "true";

export async function ensureProxySession(existingSession = null) {
  if (!SECURITY_V2_ENABLED) return null;
  const session = existingSession || (await supabase?.auth.getSession())?.data?.session;
  const token = session?.access_token;
  if (!token) throw new Error("No authenticated session available");

  const response = await fetch("/api/security/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { Authorization: "Bearer " + token },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not establish secure media session");

  const epoch = Date.now();
  if (typeof window !== "undefined") window.__VAULT_PROXY_SESSION_EPOCH = epoch;
  return epoch;
}

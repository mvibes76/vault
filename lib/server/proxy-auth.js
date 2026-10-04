import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PROXY_COOKIE = "vv_proxy_session";
const MAX_AGE_SECONDS = 30 * 60;

export function securityV2Enabled() {
  return process.env.VAULT_SECURITY_V2 === "true";
}

function getSecret() {
  const secret = process.env.VAULT_PROXY_SESSION_SECRET || "";
  if (securityV2Enabled() && secret.length < 32) {
    const err = new Error("Secure proxy session is not configured");
    err.status = 503;
    err.code = "SECURITY_CONFIG";
    throw err;
  }
  return secret;
}

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const err = new Error("Authentication service is not configured");
    err.status = 503;
    err.code = "AUTH_CONFIG";
    throw err;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || "";
}

export async function verifyBearerUser(request) {
  const token = bearerToken(request);
  if (!token) {
    const err = new Error("Authentication required");
    err.status = 401;
    err.code = "AUTH_REQUIRED";
    throw err;
  }
  const { data, error } = await serverSupabase().auth.getUser(token);
  if (error || !data?.user?.id) {
    const err = new Error("Authentication required");
    err.status = 401;
    err.code = "AUTH_INVALID";
    throw err;
  }
  return data.user;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function issueProxySession(userId, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const body = Buffer.from(JSON.stringify({ sub: userId, exp }), "utf8").toString("base64url");
  return body + "." + sign(body);
}

function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function verifyProxySessionValue(value, now = Date.now()) {
  if (!value || !value.includes(".")) return null;
  const idx = value.lastIndexOf(".");
  const body = value.slice(0, idx);
  const signature = value.slice(idx + 1);
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.sub || !Number.isFinite(payload?.exp)) return null;
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return { userId: payload.sub, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export async function requireProxyUser(request) {
  if (!securityV2Enabled()) return { userId: null, bypassed: true };

  const token = bearerToken(request);
  if (token) {
    const user = await verifyBearerUser(request);
    return { userId: user.id, bypassed: false };
  }

  const cookies = parseCookies(request.headers.get("cookie") || "");
  const session = verifyProxySessionValue(cookies[PROXY_COOKIE]);
  if (!session?.userId) {
    const err = new Error("Authentication required");
    err.status = 401;
    err.code = "AUTH_REQUIRED";
    throw err;
  }
  return { userId: session.userId, bypassed: false };
}

export function proxyCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api",
    maxAge: MAX_AGE_SECONDS,
  };
}

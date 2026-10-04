import { requireProxyUser, securityV2Enabled } from "./proxy-auth.js";
import { checkRateLimit } from "./rate-limit.js";
import { safeOutboundErrorMessage } from "./outbound-fetch.js";

export class ProxySecurityError extends Error {
  constructor(message, status, code, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export async function guardProxyRequest(request, bucket) {
  if (!securityV2Enabled()) return { userId: null, bypassed: true };

  let auth;
  try {
    auth = await requireProxyUser(request);
  } catch (error) {
    throw new ProxySecurityError("Authentication required", error?.status || 401, error?.code || "AUTH_REQUIRED");
  }

  const rate = checkRateLimit(request, auth.userId, bucket);
  if (!rate.allowed) {
    throw new ProxySecurityError("Rate limit exceeded", 429, "RATE_LIMITED", {
      "Retry-After": String(rate.retryAfter),
    });
  }
  return { ...auth, rate };
}

export function securityErrorResponse(error, fallback = "Request failed") {
  const status = Number(error?.status || 502);
  let message = fallback;
  if (status === 401) message = "Authentication required";
  else if (status === 429) message = "Too many requests";
  else if (status === 400 || status === 413 || status === 415 || status === 504) {
    message = safeOutboundErrorMessage(error);
    if (message === "Remote resource could not be fetched") message = error?.message || fallback;
  }
  return Response.json(
    { error: message, code: error?.code || undefined },
    { status, headers: error?.headers || {} }
  );
}

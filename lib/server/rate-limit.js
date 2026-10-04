const windows = new Map();

export const RATE_POLICIES = Object.freeze({
  discovery: { limit: 60, windowMs: 60_000 },
  media: { limit: 120, windowMs: 60_000 },
  stream: { limit: 30, windowMs: 60_000 },
  search: { limit: 30, windowMs: 60_000 },
  file: { limit: 60, windowMs: 60_000 },
  mutation: { limit: 60, windowMs: 60_000 },
});

function clientIp(request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "local"
  ).split(",")[0].trim();
}

function take(key, policy, now) {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + policy.windowMs };
    windows.set(key, next);
    return { allowed: true, remaining: policy.limit - 1, resetAt: next.resetAt };
  }
  current.count += 1;
  return {
    allowed: current.count <= policy.limit,
    remaining: Math.max(0, policy.limit - current.count),
    resetAt: current.resetAt,
  };
}

function prune(now) {
  if (windows.size < 1000) return;
  for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key);
}

export function checkRateLimit(request, userId, bucket, now = Date.now()) {
  const policy = RATE_POLICIES[bucket];
  if (!policy) throw new Error("Unknown rate-limit bucket");
  prune(now);

  const ip = clientIp(request);
  const user = take("u:" + userId + ":" + bucket, policy, now);
  const source = take("ip:" + ip + ":" + bucket, policy, now);
  const allowed = user.allowed && source.allowed;
  const resetAt = Math.max(user.resetAt, source.resetAt);
  return {
    allowed,
    remaining: Math.min(user.remaining, source.remaining),
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export function __resetRateLimitsForTests() {
  windows.clear();
}

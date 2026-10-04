import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  parsePublicHttpUrl,
  isBlockedAddress,
  assertPublicResolution,
} from "../lib/server/safe-url-core.mjs";
import {
  outboundFetch,
  readTextLimited,
} from "../lib/server/outbound-fetch.js";
import {
  RATE_POLICIES,
  checkRateLimit,
  __resetRateLimitsForTests,
} from "../lib/server/rate-limit.js";

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

test("SSRF URL parser permits only public HTTP(S) references", () => {
  assert.equal(parsePublicHttpUrl("https://example.com/x").protocol, "https:");
  assert.equal(parsePublicHttpUrl("http://example.com/x").protocol, "http:");

  for (const url of [
    "file:///etc/passwd",
    "data:text/plain,hello",
    "ftp://example.com/file",
    "javascript:alert(1)",
    "http://localhost/",
    "http://foo.localhost/",
    "http://metadata.google.internal/",
    "https://user:password@example.com/",
  ]) {
    assert.throws(() => parsePublicHttpUrl(url));
  }
});

test("private, link-local, metadata, reserved, and mapped IPs are blocked", () => {
  for (const ip of [
    "0.0.0.0", "10.1.2.3", "100.64.1.1", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fd00::1", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:169.254.169.254",
  ]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  assert.equal(isBlockedAddress("1.1.1.1"), false);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
});

test("mixed DNS answers are rejected instead of selecting the public address", () => {
  assert.throws(() => assertPublicResolution([
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]), /blocked address/i);
});

test("redirects are revalidated before the second network request", async () => {
  let transportCalls = 0;
  const resolver = async (hostname) => {
    if (hostname === "public.example") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "internal.example") return [{ address: "127.0.0.1", family: 4 }];
    throw new Error("unexpected host");
  };
  const requestImpl = async () => {
    transportCalls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "http://internal.example/secret" },
    });
  };

  await assert.rejects(
    outboundFetch("https://public.example/start", { resolver, requestImpl }),
    /blocked address/i
  );
  assert.equal(transportCalls, 1, "private redirect must be rejected before connecting");
});

test("validated DNS address is pinned into the transport", async () => {
  let resolverCalls = 0;
  let seenAddress = null;
  const resolver = async () => {
    resolverCalls += 1;
    return resolverCalls === 1
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "127.0.0.1", family: 4 }];
  };
  const requestImpl = async (_url, resolved) => {
    seenAddress = resolved.address;
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  };

  const response = await outboundFetch("https://public.example/file", { resolver, requestImpl });
  assert.equal(await response.text(), "ok");
  assert.equal(resolverCalls, 1);
  assert.equal(seenAddress, "93.184.216.34");
});

test("redirect chain is capped at four hops", async () => {
  let transportCalls = 0;
  const requestImpl = async () => {
    transportCalls += 1;
    return new Response(null, { status: 302, headers: { location: "/again" } });
  };
  await assert.rejects(
    outboundFetch("https://public.example/start", {
      resolver: publicDns,
      requestImpl,
      maxRedirects: 4,
    }),
    /Too many redirects/
  );
  assert.equal(transportCalls, 5);
});

test("bounded text reader terminates oversized chunked content", async () => {
  const response = new Response("x".repeat(128));
  await assert.rejects(readTextLimited(response, 32), /size limit/i);
});

test("rate limiter enforces both user and source IP buckets", () => {
  __resetRateLimitsForTests();
  const request = new Request("https://vault.example/api/stream", {
    headers: { "x-forwarded-for": "203.0.113.99" },
  });
  const limit = RATE_POLICIES.stream.limit;
  for (let i = 0; i < limit; i++) {
    assert.equal(checkRateLimit(request, "user-a", "stream", 1000).allowed, true);
  }
  const blocked = checkRateLimit(request, "user-a", "stream", 1000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter >= 1);

  // A different user on the same source IP is still blocked by the IP bucket.
  assert.equal(checkRateLimit(request, "user-b", "stream", 1000).allowed, false);
});

test("signed proxy session rejects tampering and expiry", async () => {
  process.env.VAULT_SECURITY_V2 = "true";
  process.env.VAULT_PROXY_SESSION_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
  const { issueProxySession, verifyProxySessionValue } = await import("../lib/server/proxy-auth.js");

  const now = Date.parse("2026-10-04T04:00:00Z");
  const value = issueProxySession("user-123", now);
  assert.equal(verifyProxySessionValue(value, now)?.userId, "user-123");
  assert.equal(verifyProxySessionValue(value + "tamper", now), null);
  assert.equal(verifyProxySessionValue(value, now + 31 * 60 * 1000), null);
});

test("all network-capable API routes use the security guard and no direct fetch", () => {
  const protectedRoutes = [
    "app/api/browser-search/route.js",
    "app/api/drive/route.js",
    "app/api/extract/route.js",
    "app/api/file/route.js",
    "app/api/media/route.js",
    "app/api/metadata/route.js",
    "app/api/scrape/route.js",
    "app/api/sheet-import/route.js",
    "app/api/sheet/route.js",
    "app/api/sheets-sync/route.js",
    "app/api/stream/route.js",
    "app/api/tabs/route.js",
  ];

  for (const path of protectedRoutes) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /guardProxyRequest/, path + " must require the proxy guard");
    assert.doesNotMatch(source, /(?<!safe)\bfetch\s*\(/, path + " must not call direct fetch");
  }
});

test("client mutations are bound to the verified Supabase session owner", () => {
  const source = fs.readFileSync("lib/supabase.js", "utf8");
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /identity\.user\.id !== entry\.userId/);
  assert.match(source, /MUTATION_OWNER_MISMATCH/);
});

test("security behavior is feature-gated and production defaults remain off without env", async () => {
  delete process.env.VAULT_SECURITY_V2;
  const { securityV2Enabled } = await import("../lib/server/proxy-auth.js");
  assert.equal(securityV2Enabled(), false);
});

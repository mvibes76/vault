import net from "node:net";

export class OutboundSecurityError extends Error {
  constructor(message, status = 400, code = "OUTBOUND_BLOCKED") {
    super(message);
    this.name = "OutboundSecurityError";
    this.status = status;
    this.code = code;
  }
}

const BLOCKED_NAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home"];

export function parsePublicHttpUrl(raw) {
  let url;
  try { url = new URL(String(raw || "")); }
  catch { throw new OutboundSecurityError("Invalid URL", 400, "INVALID_URL"); }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundSecurityError("Only HTTP and HTTPS URLs are supported", 400, "UNSUPPORTED_SCHEME");
  }
  if (url.username || url.password) {
    throw new OutboundSecurityError("URLs containing credentials are not supported", 400, "EMBEDDED_CREDENTIALS");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!hostname || BLOCKED_NAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new OutboundSecurityError("Blocked host", 400, "BLOCKED_HOST");
  }
  return url;
}

function ipv4Number(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function ipv4InCidr(ip, base, prefix) {
  const n = ipv4Number(ip), b = ipv4Number(base);
  if (n == null || b == null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (n & mask) === (b & mask);
}

const BLOCKED_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function expandIpv6(ip) {
  let value = ip.toLowerCase().split("%")[0];
  if (value.startsWith("::ffff:") && net.isIP(value.slice(7)) === 4) return { mappedV4: value.slice(7) };

  const hasV4 = value.includes(".");
  let v4Tail = [];
  if (hasV4) {
    const idx = value.lastIndexOf(":");
    const v4 = value.slice(idx + 1);
    const n = ipv4Number(v4);
    if (n == null) return null;
    v4Tail = [((n >>> 16) & 0xffff).toString(16), (n & 0xffff).toString(16)];
    value = value.slice(0, idx) + ":" + v4Tail.join(":");
  }

  const sides = value.split("::");
  if (sides.length > 2) return null;
  const left = sides[0] ? sides[0].split(":").filter(Boolean) : [];
  const right = sides[1] ? sides[1].split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sides.length === 1 && missing !== 0)) return null;
  const groups = sides.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8) return null;
  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return { value: out };
}

function ipv6InCidr(ip, base, prefix) {
  const a = expandIpv6(ip), b = expandIpv6(base);
  if (!a?.value || !b?.value) {
    if (a?.value === 0n && b?.value === 0n) return prefix === 0 || prefix === 128;
    if (a?.value == null || b?.value == null) return false;
  }
  if (prefix === 0) return true;
  const shift = 128n - BigInt(prefix);
  return (a.value >> shift) === (b.value >> shift);
}

const BLOCKED_V6 = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
];

export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED_V4.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
  if (family === 6) {
    const expanded = expandIpv6(address);
    if (expanded?.mappedV4) return isBlockedAddress(expanded.mappedV4);
    return BLOCKED_V6.some(([base, prefix]) => ipv6InCidr(address, base, prefix));
  }
  return true;
}

export function assertPublicResolution(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new OutboundSecurityError("Could not resolve host", 400, "DNS_EMPTY");
  }
  for (const record of records) {
    if (!record?.address || isBlockedAddress(record.address)) {
      throw new OutboundSecurityError("Host resolves to a blocked address", 400, "DNS_PRIVATE");
    }
  }
  return records;
}

export function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

export function safeRedirectUrl(location, currentUrl) {
  if (!location) throw new OutboundSecurityError("Redirect missing Location header", 502, "BAD_REDIRECT");
  return parsePublicHttpUrl(new URL(location, currentUrl).href);
}

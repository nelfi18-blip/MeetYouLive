/**
 * SSRF-safe image download used ONLY to fetch the user's persisted primary
 * photo for Rekognition CompareFaces. This module is intentionally strict:
 * the server fetches a URL that ultimately originated from user-controlled
 * profile data (primaryPhoto), so it must never be treated as a trusted
 * destination.
 *
 * Defenses implemented:
 *   - HTTPS only (no http:, no other schemes).
 *   - Hostname must match an explicit allowlist of MeetYouLive's own photo
 *     storage providers (Cloudinary + the app's own upload hosts) — never an
 *     arbitrary attacker-supplied host.
 *   - The hostname is resolved via DNS and every resolved address is checked
 *     against private/loopback/link-local/CGNAT/multicast ranges (this also
 *     blocks the 169.254.169.254 cloud metadata endpoint). Literal IP
 *     addresses in the URL are rejected outright.
 *   - Redirects are never followed automatically; each hop is re-validated
 *     against the same allowlist + DNS checks, with a hard cap on hops.
 *   - A hard timeout bounds the ENTIRE request — including the redirect
 *     hops AND the streamed body read, not just the time to receive headers.
 *     The same timer/controller stays armed until the whole download
 *     finishes or is aborted, so a slow-drip response can't outlive it.
 *   - The response body is read as a stream with a running byte counter so an
 *     oversized/slow-drip response is aborted instead of buffered fully.
 *   - The declared Content-Type AND the actual leading bytes (magic numbers)
 *     must both match a supported image format.
 *   - Nothing here ever logs the URL, response headers/tokens, or any image
 *     bytes — only generic, non-identifying error codes are thrown.
 */

const dns = require("dns").promises;
const net = require("net");
const { getPhotoVerificationConfig } = require("../config/photoVerification.js");

class SecureImageFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isPrivateIPv4 = (ip) => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed — treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments (incl. some cloud metadata relays)
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT (RFC6598)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast/reserved
  return false;
};

const isPrivateIPv6 = (ip) => {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (/^f[cd]/.test(lower)) return true; // unique local fc00::/7
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.split(":").pop();
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
};

const isPrivateAddress = (address) => {
  if (net.isIPv4(address)) return isPrivateIPv4(address);
  if (net.isIPv6(address)) return isPrivateIPv6(address);
  return true; // unknown family — treat as unsafe
};

const DEFAULT_ALLOWED_PHOTO_HOSTS = ["res.cloudinary.com", "meetyoulive.net", "www.meetyoulive.net"];

const parseHostList = (value) =>
  String(value || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

/** Resolves the current set of hostnames MeetYouLive is allowed to fetch photos from. */
const getAllowedPhotoHosts = () => {
  const hosts = new Set(DEFAULT_ALLOWED_PHOTO_HOSTS);
  for (const host of parseHostList(process.env.PHOTO_VERIFICATION_ALLOWED_PHOTO_HOSTS)) {
    hosts.add(host);
  }
  const selfHost = String(process.env.BACKEND_PUBLIC_HOST || "").trim().toLowerCase();
  if (selfHost) hosts.add(selfHost);
  return hosts;
};

/** Validates scheme/host and resolves+checks the IP(s) behind the hostname. Returns the parsed URL. */
const assertSafeImageUrl = async (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SecureImageFetchError("INVALID_URL", "Invalid image URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new SecureImageFetchError("SCHEME_NOT_ALLOWED", "Only HTTPS image URLs are allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (net.isIP(hostname)) {
    throw new SecureImageFetchError("HOST_NOT_ALLOWED", "Direct IP targets are not allowed.");
  }

  const allowedHosts = getAllowedPhotoHosts();
  if (!allowedHosts.has(hostname)) {
    throw new SecureImageFetchError("HOST_NOT_ALLOWED", "This photo host is not authorized.");
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SecureImageFetchError("DNS_RESOLUTION_FAILED", "Could not resolve the image host.");
  }

  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new SecureImageFetchError("PRIVATE_ADDRESS_BLOCKED", "The image host resolves to a disallowed address.");
  }

  return parsed;
};

const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MAGIC_BYTE_CHECKS = [
  (buf) => buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8, // JPEG
  (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, // PNG
  (buf) =>
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP", // WEBP
];

const matchesKnownImageMagicBytes = (buf) => MAGIC_BYTE_CHECKS.some((check) => {
  try {
    return check(buf);
  } catch {
    return false;
  }
});

/**
 * Downloads and validates the bytes of a MeetYouLive-hosted photo, enforcing
 * every defense documented at the top of this file. Throws
 * `SecureImageFetchError` on any violation — never silently falls back.
 */
const downloadVerifiedImageBytes = async (url, options = {}) => {
  const config = getPhotoVerificationConfig();
  const maxBytes = options.maxBytes ?? config.maxImageBytes;
  const timeoutMs = options.timeoutMs ?? config.downloadTimeoutMs;
  const maxRedirects = options.maxRedirects ?? config.maxDownloadRedirects;

  // ONE abort controller/timer bounds the ENTIRE operation — every redirect
  // hop's request AND the final response's streamed body read. It is only
  // ever cleared once, in the `finally` below, after the whole download
  // (including streaming) has finished one way or another. A per-hop timer
  // that gets cleared as soon as headers arrive would leave the slow
  // body-streaming phase unbounded, which is exactly the gap this closes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;
    let response = null;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const parsed = await assertSafeImageUrl(currentUrl);
      let hopResponse;
      try {
        hopResponse = await fetch(parsed.toString(), { redirect: "manual", signal: controller.signal });
      } catch (err) {
        if (err?.name === "AbortError") {
          throw new SecureImageFetchError("DOWNLOAD_TIMEOUT", "The image download timed out.");
        }
        throw new SecureImageFetchError("DOWNLOAD_FAILED", "Could not download the image.");
      }

      if (hopResponse.status >= 300 && hopResponse.status < 400) {
        const location = hopResponse.headers.get("location");
        if (!location) {
          throw new SecureImageFetchError("DOWNLOAD_FAILED", "Redirect without a location header.");
        }
        // Resolve relative redirects against the current URL, then the next
        // loop iteration re-validates the resolved target from scratch.
        currentUrl = new URL(location, parsed).toString();
        // eslint-disable-next-line no-continue
        continue;
      }

      response = hopResponse;
      break;
    }

    if (!response) {
      throw new SecureImageFetchError("TOO_MANY_REDIRECTS", "Too many redirects while fetching the image.");
    }

    if (!response.ok) {
      throw new SecureImageFetchError("DOWNLOAD_FAILED", "Could not download the image.");
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new SecureImageFetchError("UNSUPPORTED_CONTENT_TYPE", "The image content type is not supported.");
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new SecureImageFetchError("IMAGE_TOO_LARGE", "The image exceeds the maximum allowed size.");
    }

    if (!response.body || typeof response.body.getReader !== "function") {
      throw new SecureImageFetchError("DOWNLOAD_FAILED", "Could not read the image body.");
    }

    // Streaming read still happens under the SAME controller/timer set up
    // above — a slow-drip body (e.g. a byte every few seconds) is aborted by
    // the timeout instead of hanging past it, since the timer was never
    // cleared when the headers arrived.
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      let step;
      try {
        step = await reader.read();
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          throw new SecureImageFetchError("DOWNLOAD_TIMEOUT", "The image download timed out.");
        }
        throw new SecureImageFetchError("DOWNLOAD_FAILED", "Could not read the image body.");
      }
      if (step.done) break;
      total += step.value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // best-effort cancel only
        }
        throw new SecureImageFetchError("IMAGE_TOO_LARGE", "The image exceeds the maximum allowed size.");
      }
      chunks.push(Buffer.from(step.value));
    }

    const bytes = Buffer.concat(chunks);
    if (!matchesKnownImageMagicBytes(bytes)) {
      throw new SecureImageFetchError("UNSUPPORTED_CONTENT_TYPE", "The image content is not a supported format.");
    }

    return bytes;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  SecureImageFetchError,
  getAllowedPhotoHosts,
  isPrivateAddress,
  assertSafeImageUrl,
  downloadVerifiedImageBytes,
};

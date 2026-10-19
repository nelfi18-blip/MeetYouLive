const dns = require("dns").promises;

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

// NOTE: no jest.resetModules() here — the module reads process.env at
// call-time (not require-time), and resetModules would make the `dns` mock
// captured above diverge from the instance the module actually uses.
const loadModule = () => require("../secureImageFetch.js");

const makeStreamResponse = (bytes, { status = 200, headers = {} } = {}) => {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  let delivered = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headerMap.get(String(name).toLowerCase()) ?? null },
    body: {
      getReader: () => ({
        read: async () => {
          if (delivered) return { done: true, value: undefined };
          delivered = true;
          return { done: false, value: bytes };
        },
        cancel: async () => {},
      }),
    },
  };
};

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);

describe("secureImageFetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    dns.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  describe("assertSafeImageUrl / host + scheme validation", () => {
    it("rejects non-HTTPS URLs", async () => {
      const { assertSafeImageUrl, SecureImageFetchError } = loadModule();
      await expect(assertSafeImageUrl("http://res.cloudinary.com/a.jpg")).rejects.toThrow(SecureImageFetchError);
    });

    it("rejects hosts that are not on the authorized photo-provider allowlist", async () => {
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://evil.example.com/a.jpg")).rejects.toMatchObject({
        code: "HOST_NOT_ALLOWED",
      });
    });

    it("rejects literal IP-address targets", async () => {
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://203.0.113.10/a.jpg")).rejects.toMatchObject({
        code: "HOST_NOT_ALLOWED",
      });
    });

    it("allows an explicitly authorized host (Cloudinary)", async () => {
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://res.cloudinary.com/demo/a.jpg")).resolves.toBeInstanceOf(URL);
    });

    it("blocks a host that resolves to a private/loopback address (SSRF)", async () => {
      dns.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://res.cloudinary.com/a.jpg")).rejects.toMatchObject({
        code: "PRIVATE_ADDRESS_BLOCKED",
      });
    });

    it("blocks a host that resolves to the cloud metadata address", async () => {
      dns.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://res.cloudinary.com/a.jpg")).rejects.toMatchObject({
        code: "PRIVATE_ADDRESS_BLOCKED",
      });
    });

    it("blocks a host that resolves to a private IPv6 (unique-local) address", async () => {
      dns.lookup.mockResolvedValue([{ address: "fd00::1", family: 6 }]);
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://res.cloudinary.com/a.jpg")).rejects.toMatchObject({
        code: "PRIVATE_ADDRESS_BLOCKED",
      });
    });

    it("honors extra hosts configured via PHOTO_VERIFICATION_ALLOWED_PHOTO_HOSTS", async () => {
      process.env.PHOTO_VERIFICATION_ALLOWED_PHOTO_HOSTS = "cdn.example.net";
      const { assertSafeImageUrl } = loadModule();
      await expect(assertSafeImageUrl("https://cdn.example.net/a.jpg")).resolves.toBeInstanceOf(URL);
    });
  });

  describe("downloadVerifiedImageBytes", () => {
    it("downloads and returns the bytes for a valid JPEG from an authorized host", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeStreamResponse(JPEG_BYTES, { headers: { "content-type": "image/jpeg", "content-length": String(JPEG_BYTES.length) } })
      );
      const { downloadVerifiedImageBytes } = loadModule();
      const bytes = await downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg");
      expect(Buffer.compare(bytes, JPEG_BYTES)).toBe(0);
    });

    it("rejects a redirect to an unauthorized host instead of following it", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: { get: (name) => (name.toLowerCase() === "location" ? "https://evil.example.com/steal.jpg" : null) },
        body: null,
      });
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg")).rejects.toMatchObject({
        code: "HOST_NOT_ALLOWED",
      });
    });

    it("stops following redirects after the configured maximum number of hops", async () => {
      global.fetch = jest.fn().mockImplementation(async () => ({
        ok: false,
        status: 302,
        headers: { get: (name) => (name.toLowerCase() === "location" ? "https://res.cloudinary.com/next.jpg" : null) },
        body: null,
      }));
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(
        downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg", { maxRedirects: 2 })
      ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("rejects a response whose declared Content-Length exceeds the maximum allowed size", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeStreamResponse(JPEG_BYTES, {
          headers: { "content-type": "image/jpeg", "content-length": String(50 * 1024 * 1024) },
        })
      );
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(
        downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg", { maxBytes: 1024 })
      ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    });

    it("aborts an excessive streamed download even without a declared Content-Length", async () => {
      const bigChunk = Buffer.alloc(2048, 1);
      global.fetch = jest.fn().mockResolvedValue(
        makeStreamResponse(bigChunk, { headers: { "content-type": "image/jpeg" } })
      );
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(
        downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg", { maxBytes: 1024 })
      ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    });

    it("rejects a disallowed/unsupported declared content type", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeStreamResponse(JPEG_BYTES, { headers: { "content-type": "application/pdf" } })
      );
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg")).rejects.toMatchObject({
        code: "UNSUPPORTED_CONTENT_TYPE",
      });
    });

    it("rejects content whose leading bytes do not match a supported image format (type spoofing)", async () => {
      const notAnImage = Buffer.from("<html>not an image</html>");
      global.fetch = jest.fn().mockResolvedValue(
        makeStreamResponse(notAnImage, { headers: { "content-type": "image/jpeg" } })
      );
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg")).rejects.toMatchObject({
        code: "UNSUPPORTED_CONTENT_TYPE",
      });
    });

    it("wraps a network timeout/abort as a timeout-specific error", async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        const err = new Error("aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      });
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg")).rejects.toMatchObject({
        code: "DOWNLOAD_TIMEOUT",
      });
    });

    it("aborts a slow-drip streamed body once the timeout fires mid-stream (timeout stays active during streaming)", async () => {
      // The reader's `read()` never resolves on its own — it only rejects
      // when the real AbortSignal passed to `fetch` fires. This proves the
      // same timer that bounds the initial request is still armed while the
      // body is being streamed (the bug being fixed: the old code cleared
      // the timer as soon as headers arrived, leaving streaming unbounded).
      global.fetch = jest.fn().mockImplementation((_url, { signal } = {}) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: (name) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null) },
          body: {
            getReader: () => ({
              read: () =>
                new Promise((resolve, reject) => {
                  const onAbort = () => {
                    const err = new Error("aborted");
                    err.name = "AbortError";
                    reject(err);
                  };
                  if (signal.aborted) {
                    onAbort();
                    return;
                  }
                  signal.addEventListener("abort", onAbort, { once: true });
                }),
              cancel: async () => {},
            }),
          },
        });
      });
      const { downloadVerifiedImageBytes } = loadModule();
      await expect(
        downloadVerifiedImageBytes("https://res.cloudinary.com/demo/a.jpg", { timeoutMs: 10 })
      ).rejects.toMatchObject({ code: "DOWNLOAD_TIMEOUT" });
    });
  });
});

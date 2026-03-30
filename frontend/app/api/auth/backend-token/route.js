import { getToken } from "next-auth/jwt";

/**
 * POST /api/auth/backend-token
 *
 * Server-side proxy that calls the backend /api/auth/google-session endpoint
 * with the INTERNAL_API_SECRET. This keeps the secret off the client while
 * still allowing the dashboard (and login page) to recover a backend JWT when
 * the server-side NextAuth jwt() callback failed (e.g. backend was sleeping).
 *
 * Uses getToken() from next-auth/jwt to read the session directly from the
 * request cookies, which is more reliable in Next.js 15 App Router than
 * getServerSession().
 */
export async function POST(request) {
  console.log("[backend-token] Request received");

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    console.warn("[backend-token] getToken returned null – no valid NextAuth session cookie");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!token.googleEmail) {
    console.warn(
      "[backend-token] Session token found but missing googleEmail. Available keys:",
      Object.keys(token).join(", ")
    );
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[backend-token] Valid session for googleEmail:", token.googleEmail);

  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    console.error("[backend-token] API URL is not configured (API_URL / NEXT_PUBLIC_API_URL)");
    return Response.json({ error: "API URL not configured" }, { status: 500 });
  }

  // INTERNAL_API_SECRET is optional: the backend only enforces it when the
  // secret is also configured there. If it is not set here we proceed without
  // the header so the proxy still works in environments where the secret has
  // not yet been added to the Vercel environment variables.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.warn(
      "[backend-token] INTERNAL_API_SECRET is not set – sending request without secret header. " +
        "Set this variable in both frontend and backend for production security."
    );
  }

  const requestHeaders = {
    "Content-Type": "application/json",
  };
  if (internalSecret) {
    requestHeaders["x-internal-api-secret"] = internalSecret;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    console.log("[backend-token] Calling backend /api/auth/google-session for:", token.googleEmail);

    const res = await fetch(`${apiUrl}/api/auth/google-session`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        email: token.googleEmail,
        name: token.googleName || "",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body = {};
      try {
        body = await res.json();
      } catch {
        // ignore parse error
      }

      console.error(
        `[backend-token] Backend /api/auth/google-session returned ${res.status}:`,
        body
      );

      return Response.json(
        { error: body.message || "Backend error" },
        { status: res.status }
      );
    }

    const data = await res.json();

    if (!data?.token) {
      console.error(
        "[backend-token] Backend responded OK but returned no token. Response body:",
        data
      );
      return Response.json({ error: "Backend returned no token" }, { status: 500 });
    }

    console.log("[backend-token] Token successfully obtained for:", token.googleEmail);
    return Response.json(data);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[backend-token] Backend request timed out after 20s");
      return Response.json({ error: "Backend timeout" }, { status: 504 });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[backend-token] Could not reach backend:", message);
    return Response.json({ error: "Could not reach backend" }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}

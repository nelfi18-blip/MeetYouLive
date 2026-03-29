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
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.googleEmail) {
    console.warn("[backend-token] No valid NextAuth session or missing googleEmail");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    console.error("[backend-token] API URL is not set");
    return Response.json({ error: "API URL not configured" }, { status: 500 });
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.error("[backend-token] INTERNAL_API_SECRET is not set");
    return Response.json({ error: "Internal API secret not configured" }, { status: 500 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${apiUrl}/api/auth/google-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-secret": internalSecret,
      },
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
    return Response.json(data);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[backend-token] Backend request timed out");
      return Response.json({ error: "Backend timeout" }, { status: 504 });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[backend-token] Could not reach backend:", message);
    return Response.json({ error: "Could not reach backend" }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * POST /api/auth/backend-token
 *
 * Server-side proxy that calls the backend /api/auth/google-session endpoint
 * with the INTERNAL_API_SECRET. This keeps the secret off the client while
 * still allowing the dashboard (and login page) to recover a backend JWT when
 * the server-side NextAuth jwt() callback failed (e.g. backend was sleeping).
 *
 * Requires a valid NextAuth session – returns 401 if none is present.
 */
export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.googleEmail) {
    console.warn("[backend-token] No valid NextAuth session or missing googleEmail");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    console.error("[backend-token] NEXT_PUBLIC_API_URL is not set");
    return Response.json({ error: "API URL not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${apiUrl}/api/auth/google-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({
        email: session.googleEmail,
        name: session.googleName || "",
      }),
    });

    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch { /* ignore parse error */ }
      console.error(`[backend-token] Backend /api/auth/google-session returned ${res.status}:`, body);
      return Response.json(
        { error: body.message || "Backend error" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    console.error("[backend-token] Could not reach backend:", err.message);
    return Response.json({ error: "Could not reach backend" }, { status: 502 });
  }
}

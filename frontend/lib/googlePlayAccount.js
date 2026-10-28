/**
 * Resolves the Google Play `accountId` from the backend user that the JWT
 * authenticates (GET /api/user/me), so the id bound to the purchase always
 * matches the user whose token later verifies it. Works for both NextAuth
 * and JWT-only (localStorage) sessions.
 *
 * Resolves to `{ accountId }` or `{ error }` where error is:
 *  - "auth":    token rejected (401/403/404) or no usable id returned
 *  - "network": request failed or backend unavailable (5xx / non-JSON)
 */
export async function resolveGooglePlayAccountId(token, apiUrl, fetchImpl = fetch) {
  if (!token) return { error: "auth" };

  let res;
  try {
    res = await fetchImpl(`${apiUrl}/api/user/me`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
  } catch {
    return { error: "network" };
  }

  if (res.status === 401 || res.status === 403 || res.status === 404) {
    return { error: "auth" };
  }
  if (!res.ok) return { error: "network" };

  let user;
  try {
    user = await res.json();
  } catch {
    return { error: "network" };
  }

  const id = user?._id ?? user?.id;
  return id ? { accountId: String(id) } : { error: "auth" };
}

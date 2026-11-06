// Each request is bound to an auth epoch and a channel sequence. A revoked
// epoch cannot be restored by polling, stale responses, or report completion.
const initial = () => ({ lives: [], loading: true, selectedId: "", audience: [], localCount: 0,
  audiencePage: 1, target: { targetType: "live", targetId: "" }, category: "commercial_sex",
  reason: "", error: "", notice: "", sending: false });
const SERVER_SNAPSHOT = initial();

export function createAgencySupervisionStore({ getToken, fetcher = (...args) => fetch(...args), apiUrl = "" }) {
  let state = initial(), epoch = 0, token = null, blocked = false, stopped = false;
  const listeners = new Set(), active = new Set(), sequence = { lives: 0, audience: 0, report: 0 };
  const patch = (changes) => { state = { ...state, ...changes }; listeners.forEach((listener) => listener()); };
  function invalidate() { epoch += 1; for (const request of active) request.controller.abort(); active.clear(); }
  function clearSelection() {
    sequence.audience += 1; sequence.report += 1;
    patch({ selectedId: "", audience: [], localCount: 0, audiencePage: 1,
      target: { targetType: "live", targetId: "" }, reason: "", notice: "", sending: false });
  }
  function revoke() {
    invalidate(); blocked = true;
    patch({ ...initial(), loading: false, error: "accessRevoked" });
  }
  function begin(channel) {
    if (stopped || blocked) return null;
    const currentToken = getToken();
    if (!currentToken || (token && token !== currentToken)) { revoke(); return null; }
    token = currentToken;
    for (const pending of active) if (pending.channel === channel) { pending.controller.abort(); active.delete(pending); }
    const request = { channel, sequence: ++sequence[channel], epoch, token,
      selectedId: state.selectedId, page: state.audiencePage, controller: new AbortController() };
    active.add(request); return request;
  }
  function sameSession(request) {
    if (stopped || request.epoch !== epoch || blocked) return false;
    if (getToken() !== request.token) { revoke(); return false; }
    return true;
  }
  const current = (request) => sameSession(request) && request.sequence === sequence[request.channel] &&
    (request.channel === "lives" || request.selectedId === state.selectedId && request.page === state.audiencePage);
  async function read(request, path, options = {}) {
    const response = await fetcher(apiUrl + path, { cache: "no-store", ...options,
      headers: { Authorization: "Bearer " + request.token, ...options.headers }, signal: request.controller.signal });
    if (!sameSession(request)) return null;
    // Even an older response on the SAME auth epoch can revoke access. A newer
    // successful request cannot override that denial without explicit refresh.
    if (response.status === 401 || response.status === 403) { revoke(); return null; }
    const payload = await response.json();
    return current(request) ? { response, payload } : null;
  }
  async function loadLives() {
    const request = begin("lives"); if (!request) return;
    try {
      const result = await read(request, "/api/agency/supervision/lives"); if (!result) return;
      if (!result.response.ok) throw new Error("Unavailable");
      const lives = Array.isArray(result.payload.lives) ? result.payload.lives : [];
      if (state.selectedId && !lives.some((entry) => entry.id === state.selectedId)) clearSelection();
      patch({ lives, loading: false, error: "" });
    } catch {
      if (current(request)) { invalidate(); patch({ ...initial(), loading: false, error: "loadError" }); }
    } finally { active.delete(request); }
  }
  function liveUnavailable(request) {
    if (!current(request)) return;
    const id = state.selectedId;
    clearSelection(); patch({ lives: state.lives.filter((live) => live.id !== id), error: "accessRevoked" });
  }
  async function loadAudience() {
    if (!state.selectedId) return;
    const request = begin("audience"); if (!request) return;
    try {
      const result = await read(request, "/api/agency/supervision/lives/" + encodeURIComponent(request.selectedId) + "/audience?page=" + request.page);
      if (!result) return;
      if (result.response.status === 404) { liveUnavailable(request); return; }
      if (!result.response.ok) throw new Error("Unavailable");
      patch({ audience: Array.isArray(result.payload.viewers) ? result.payload.viewers : [], localCount: Number(result.payload.totalLocal) || 0 });
    } catch {
      if (current(request)) { clearSelection(); patch({ error: "loadError" }); }
    } finally { active.delete(request); }
  }
  async function submitReport() {
    if (!state.selectedId || state.reason.trim().length < 10 || state.sending) return;
    const request = begin("report"); if (!request) return;
    const body = { ...state.target, category: state.category, reason: state.reason.trim() };
    patch({ sending: true, error: "", notice: "" });
    try {
      const result = await read(request, "/api/agency/supervision/lives/" + encodeURIComponent(request.selectedId) + "/reports", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!result) return;
      if (result.response.status === 404) { liveUnavailable(request); return; }
      if (result.response.status === 409) { patch({ error: "duplicate" }); return; }
      if (result.response.status === 429) { patch({ error: "rateLimited" }); return; }
      if (!result.response.ok) throw new Error("Unavailable");
      patch({ reason: state.reason.trim() === body.reason ? "" : state.reason, notice: "sent" });
    } catch { if (current(request)) patch({ error: "reportError" }); }
    finally { if (current(request)) patch({ sending: false }); active.delete(request); }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state, getServerSnapshot: () => SERVER_SNAPSHOT,
    loadLives, loadAudience, submitReport,
    refresh() { invalidate(); token = null; blocked = false; patch(initial()); return loadLives(); },
    chooseLive(id) {
      if (blocked || !state.lives.some((live) => live.id === id)) return;
      clearSelection(); patch({ selectedId: id, error: "" }); return loadAudience();
    },
    setPage(page) {
      if (blocked || !Number.isSafeInteger(page) || page < 1) return;
      sequence.audience += 1; sequence.report += 1;
      patch({ audiencePage: page, audience: [], target: { targetType: "live", targetId: "" }, sending: false });
      return loadAudience();
    },
    setTarget(target) { if (!blocked) patch({ target, notice: "" }); },
    setCategory(category) { if (!blocked) patch({ category }); },
    setReason(reason) { if (!blocked) patch({ reason }); },
    start() {
      stopped = false; loadLives();
      const livesTimer = setInterval(loadLives, 30000), audienceTimer = setInterval(loadAudience, 15000);
      return () => {
        stopped = true; invalidate(); clearInterval(livesTimer); clearInterval(audienceTimer);
        // Drop sensitive snapshots even if a framework preserves the store for
        // a later remount. Do not notify subscribers during unmount cleanup.
        state = { ...initial(), loading: false, error: blocked ? "accessRevoked" : "" };
      };
    },
  };
}

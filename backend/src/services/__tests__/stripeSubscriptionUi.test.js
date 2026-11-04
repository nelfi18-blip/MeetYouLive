const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadHandler(file, name, context) {
  const source = fs.readFileSync(path.join(__dirname, "../../../../frontend/app", file), "utf8");
  const start = source.indexOf(`const ${name} = async () => {`);
  const end = source.indexOf("\n  };", start) + "\n  };".length;
  if (start < 0 || end <= start) throw new Error("Expected real UI handler");
  return vm.runInNewContext(`${source.slice(start, end)}\n${name}`, context);
}

test.each([409, 503])("settings preserves session and shows the controlled instruction on HTTP %s", async (status) => {
  const clearAllAuth = jest.fn(), signOut = jest.fn(), disconnect = jest.fn(), setDeleteError = jest.fn();
  const setSubscriptionResolution = jest.fn();
  const handler = loadHandler("settings/page.jsx", "handleDeleteAccount", {
    window: { confirm: () => true }, t: (key) => key, localStorage: { getItem: () => "synthetic-token" },
    API_URL: "https://example.invalid", setDeleting: jest.fn(), setDeleteError, setSubscriptionResolution,
    fetch: jest.fn().mockResolvedValue({ ok: false, status, json: async () => ({ message: "Ve a Suscripción o contacta con soporte. Tu cuenta no se ha eliminado.", resolution: status === 409 ? "subscription" : "retry" }) }),
    clearAllAuth, signOut, socket: { disconnect },
  });
  await handler();
  expect(setDeleteError).toHaveBeenLastCalledWith(expect.stringContaining("Tu cuenta no se ha eliminado"));
  expect(setSubscriptionResolution).toHaveBeenLastCalledWith(status === 409);
  const settingsSource = fs.readFileSync(path.join(__dirname, "../../../../frontend/app/settings/page.jsx"), "utf8");
  expect(settingsSource).toContain('href="/subscription?resolve=account-deletion"');
  const subscriptionSource = fs.readFileSync(path.join(__dirname, "../../../../frontend/app/subscription/page.jsx"), "utf8");
  expect(subscriptionSource).toContain("deletionResolution && !isActive");
  expect(clearAllAuth).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled(); expect(disconnect).not.toHaveBeenCalled();
});

test.each([false, true])("existing cancellation UI requires explicit confirmation (%s)", async (confirmed) => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  const handler = loadHandler("subscription/page.jsx", "handleCancel", {
    confirm: () => confirmed, t: (key) => key, localStorage: { getItem: () => "synthetic-token" },
    API_URL: "https://example.invalid", fetch, router: { replace: jest.fn() },
    setActionLoading: jest.fn(), setError: jest.fn(), setSuccess: jest.fn(), setStatus: jest.fn(),
  });
  await handler();
  expect(fetch).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  if (confirmed) expect(fetch.mock.calls[0][1].method).toBe("DELETE");
});

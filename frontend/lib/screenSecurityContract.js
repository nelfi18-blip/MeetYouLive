// A method existing or an empty ACK is NOT evidence of native protection.
// Contract 1 is returned only after the UI thread reads FLAG_SECURE back.
export async function applyVerifiedScreenSecurity(plugin, enabled, timeoutMs = 8000) {
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => enabled ? plugin.enable() : plugin.disable()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Native protection timed out"),
          { code: "SCREEN_SECURITY_TIMEOUT" })), timeoutMs);
      }),
    ]);
    const verified = result?.screenSecurityContract === 1 &&
      result.verifiedOnUiThread === true && result.secure === enabled;
    return { success: verified, updateRequired: !verified };
  } catch (error) {
    // Known runtime failures can be retried. Missing/old/unknown implementations
    // cannot be trusted; a late result after timeout can never reveal the Live.
    const retryable = ["SCREEN_SECURITY_UNAVAILABLE", "SCREEN_SECURITY_FAILED",
      "SCREEN_SECURITY_VERIFY_FAILED"].includes(error?.code);
    return { success: false, updateRequired: !retryable };
  } finally {
    clearTimeout(timer);
  }
}

const { runReactivationJob } = require("../reactivation.service.js");
const { startReactivationJob } = require("../../jobs/reactivation.job.js");

describe("unverified inactivity campaigns", () => {
  it("never constructs or sends fabricated like/match reminders", async () => {
    await expect(runReactivationJob()).resolves.toEqual({ paused: true, sent: 0 });
  });

  it("does not schedule a background inactivity campaign", () => {
    const timeout = jest.spyOn(global, "setTimeout");
    const interval = jest.spyOn(global, "setInterval");
    const log = jest.spyOn(console, "info").mockImplementation(() => {});
    try {
      startReactivationJob();
      expect(timeout).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
      interval.mockRestore();
      log.mockRestore();
    }
  });
});

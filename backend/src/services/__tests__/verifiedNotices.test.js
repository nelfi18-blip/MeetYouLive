const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const readJob = (name) => fs.readFileSync(path.join(__dirname, "..", "..", "jobs", name), "utf8");

describe("user-facing notice authenticity", () => {
  it("keeps real first-time push dispatch and stops scheduled unverified nudges", () => {
    const svc = read("push.service.js");
    const job = readJob("push.job.js");
    expect(svc).toContain("async function flushQueue()");
    expect(svc).toContain("const result = await sendPush(uid, user.pushToken, title, body");
    expect(svc).toContain("result.accepted < 1");
    expect(svc).toContain('if (type === "reactivation")');
    expect(svc).toContain("return { sent: 0, paused: true }");
    expect(svc).not.toContain("reminderScheduledAt }");
    expect(job).toContain("setInterval(runFlush, FLUSH_INTERVAL_MS)");
    expect(job).not.toContain("runReminders()");
    expect(job).not.toContain("setInterval(runReminders");
  });

  it("cannot revive unverifiable reactivation marketing with dormant email templates", () => {
    const svc = read("email.service.js");
    const job = readJob("reactivation.job.js");
    expect(job).not.toContain("setInterval(");
    expect(job).not.toContain("setTimeout(");
    expect(svc).not.toMatch(/Estás perdiendo matches ahora mismo|Tienes nuevos likes esperándote|Tu perfil está perdiendo visibilidad/);
  });

  it("does not send an invented midnight reward deadline", () => {
    const job = readJob("dailyRewardReminder.job.js");
    expect(job).toContain("Consulta si tienes una recompensa disponible");
    expect(job).not.toContain("antes de medianoche");
    expect(job).not.toContain("está en riesgo");
  });

  it("never fabricates Boost profile visits or chat starts from user IDs", () => {
    const file = fs.readFileSync(path.join(__dirname, "..", "..", "controllers", "match.controller.js"), "utf8");
    expect(file).toContain("matchesGained: matchesDelta");
    expect(file).not.toContain("viewsEstimate");
    expect(file).not.toContain("chatsEstimate");
    expect(file).not.toContain("uidByte %");
  });

  it("Boost activity is not inflated by a fabricated count floor", () => {
    const file = fs.readFileSync(path.join(__dirname, "..", "..", "controllers", "match.controller.js"), "utf8");
    expect(file).toContain("res.json({ count: realCount })");
    expect(file).not.toContain("ACTIVE_BOOST_FLOOR");
    expect(file).not.toContain("Math.max(realCount");
  });

});

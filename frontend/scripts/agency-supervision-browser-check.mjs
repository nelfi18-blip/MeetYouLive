// Local-only harness: actual agency/Admin React views, actual HTTP/JWT routes,
// live Socket.IO audience and persisted MongoDB reports. No Agora media/video.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = createRequire(path.join(frontend, "../backend/package.json"));
const tools = createRequire(path.join(process.env.AGENCY_BROWSER_TOOLS || "/tmp/agency-browser-tools", "package.json"));
const { build } = tools("esbuild"), { chromium } = tools("playwright");
const uri = process.env.INTEGRATION_MONGO_URI;
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri || "")) throw new Error("Disposable localhost MongoDB only");
process.env.JWT_SECRET = "agency-browser-synthetic-local-only";
const mongoose = backend("mongoose"), jwt = backend("jsonwebtoken");
const folder = process.env.AGENCY_BROWSER_ARTIFACTS || "/tmp/agency-browser-artifacts";
await mkdir(folder, { recursive: true });
const evidence = { fixture: "synthetic accounts and Live; real Socket.IO audience, no media stream or physical phones", checks: [], browserErrors: [] };
let browser, io, server, models, accounts = [], live, timers = [];
try {
  await mongoose.connect(uri, { autoIndex: false });
  const User = backend("../backend/src/models/User.js"), Live = backend("../backend/src/models/Live.js");
  const Report = backend("../backend/src/models/Report.js"), Link = backend("../backend/src/models/AgencyRelationship.js");
  const Audit = backend("../backend/src/models/StaffAuditLog.js");
  const nonce = Date.now().toString(36);
  const make = (name, fields = {}) => User.create({ username: name + nonce, email: `${name}${nonce}@example.invalid`, password: "synthetic-browser", ...fields });
  const agency = await make("supervision_agency", { role: "creator", creatorStatus: "approved", agencyProfile: { enabled: true } }); accounts.push(agency);
  const creator = await make("supervision_creator", { role: "creator", creatorStatus: "approved" }); accounts.push(creator);
  const viewer = await make("supervision_viewer"); accounts.push(viewer);
  const admin = await make("supervision_admin", { role: "admin" }); accounts.push(admin);
  await Link.create({ parentCreator: agency._id, subCreator: creator._id, createdBy: admin._id, percentage: 10, status: "active", subCreatorAgreed: true });
  live = await Live.create({ user: creator._id, streamKey: "synthetic-agency-browser", title: "SyntheticSupervisionTitle".repeat(5), isLive: true });
  const express = backend("express"), app = express(); app.use(express.json());
  app.use("/api/agency", backend("../backend/src/routes/agency.routes.js"));
  app.use("/api/admin", backend("../backend/src/routes/admin.routes.js"));
  models = Object.values(mongoose.models);
  for (const model of models) await model.createCollection();
  const dictionaries = Object.fromEntries(await Promise.all(["es", "en", "pt"].map(async (lang) => [lang, JSON.parse(await readFile(path.join(frontend, "messages", lang + ".json"), "utf8"))])));
  let js, css;
  app.get("/fixture.js", (_req, res) => res.type("application/javascript").send(Buffer.from(js)));
  app.get("/fixture.css", (_req, res) => res.type("text/css").send(Buffer.from(css)));
  app.get("/fixture/session", (req, res) => {
    const user = req.query.view === "admin" ? admin : req.query.view === "viewer" ? viewer : agency;
    res.json({ token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "20m" }), liveId: String(live._id) });
  });
  app.get("/", (_req, res) => res.type("html").send(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic agency moderation check</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#100b20;color:white;font:16px system-ui}main{max-width:1100px;margin:auto;padding:12px;min-width:0}*{box-sizing:border-box}</style><main id="root"></main><script src="/fixture.js"></script></html>`));
  server = createServer(app); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}`; process.env.FRONTEND_URL = address;
  const interval = globalThis.setInterval;
  globalThis.setInterval = (...args) => { const timer = interval(...args); timers.push(timer); return timer; };
  try { io = backend("../backend/src/lib/socket.js").initSocket(server); } finally { globalThis.setInterval = interval; }
  const bundled = await build({ bundle: true, write: false, format: "iife", jsx: "automatic", outdir: "/tmp/agency-browser-bundle", loader: { ".css": "local-css" },
    define: { "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(address), "process.env.NODE_ENV": '"production"' },
    stdin: { resolveDir: frontend, contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client'; import {io} from 'socket.io-client';
      import Agency from './components/agency/AgencyLiveSupervision.jsx'; import Admin from './app/admin/reports/page.jsx';
      (async()=>{
        const params=new URLSearchParams(location.search), view=params.get('view')||'agency';
        const dictionaries=${JSON.stringify(dictionaries)}; window.fixtureDictionary=dictionaries[params.get('lang')||'es'];
        window.fixture={view}; const session=await fetch('/fixture/session?view='+view).then(r=>r.json());
        localStorage.setItem('token',session.token); localStorage.setItem('admin_token',session.token);
        if(view==='viewer') { window.fixture.socket=io(location.origin,{auth:{token:session.token},transports:['websocket']});
          window.fixture.socket.on('connect',()=>window.fixture.socket.emit('join_live_room',{liveId:session.liveId})); return; }
        createRoot(document.getElementById('root')).render(React.createElement(view==='admin'?Admin:Agency));
      })();` },
    plugins: [{ name: "fixture-context", setup(builder) {
      const stubs = {
        "@/lib/token": "export const getToken=()=>localStorage.getItem('token'); export const clearAdminToken=()=>localStorage.removeItem('admin_token');",
        "@/contexts/LanguageContext": "const t=key=>key.split('.').reduce((value,part)=>value?.[part],window.fixtureDictionary)||key; export const useLanguage=()=>({t});",
        "next/navigation": "const router={replace:path=>{window.fixture.redirect=path},push:path=>{window.fixture.redirect=path}}; export const useRouter=()=>router;",
        "next/link": "import React from 'react'; export default function Link({href,...props}){return React.createElement('a',{href,...props})}",
      };
      builder.onResolve({ filter: /^(@\/lib\/token|@\/contexts\/LanguageContext|next\/navigation|next\/link)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: stubs[args.path], loader: "js", resolveDir: frontend }));
      builder.onResolve({ filter: /^@\// }, (args) => ({ path: path.join(frontend, args.path.slice(2) + ".js") }));
    } }],
  });
  js = bundled.outputFiles.find((file) => file.path.endsWith(".js")).contents;
  css = bundled.outputFiles.find((file) => file.path.endsWith(".css")).contents;
  browser = await chromium.launch({ ...(process.env.AGENCY_CHROMIUM_PATH ? { executablePath: process.env.AGENCY_CHROMIUM_PATH } : {}), args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const watchErrors = (page) => page.on("pageerror", (error) => { evidence.browserErrors.push(error.message); console.error("Browser:", error.message); });
  const viewerContext = await browser.newContext();
  const audiencePage = await viewerContext.newPage(); watchErrors(audiencePage); await audiencePage.goto(address + "/?view=viewer");
  for (let i = 0; i < 60 && !backend("../backend/src/lib/socket.js").getLiveAudience(String(live._id)).length; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(backend("../backend/src/lib/socket.js").getLiveAudience(String(live._id))[0]?.userId, String(viewer._id));
  evidence.checks.push("Authenticated viewer entered the synthetic public Live through the actual Socket.IO handler");
  const agencyPage = await context.newPage(); watchErrors(agencyPage); await agencyPage.clock.install();
  await agencyPage.goto(address + "/?lang=es"); const es = dictionaries.es;
  await agencyPage.getByRole("button", { name: es.agencySupervision.audience, exact: true }).click();
  await agencyPage.getByText("@" + viewer.username, { exact: false }).waitFor();
  await agencyPage.getByRole("button", { name: es.agencySupervision.reportPerson, exact: true }).click();
  const incident = "Incidente sintético observado para probar moderación central";
  for (const category of ["harassment", "fraud"]) {
    await agencyPage.locator("#agency-report-category").selectOption(category); await agencyPage.locator("#agency-report-reason").fill(incident);
    await agencyPage.getByRole("button", { name: es.agencySupervision.submit, exact: true }).click();
    await agencyPage.getByRole("status").filter({ hasText: es.agencySupervision.sent }).waitFor();
  }
  assert.equal(await Report.countDocuments({ reporter: agency._id }), 2);
  await agencyPage.locator("#agency-report-reason").fill(incident);
  await agencyPage.getByRole("button", { name: es.agencySupervision.submit, exact: true }).click();
  await agencyPage.getByRole("alert").filter({ hasText: es.agencySupervision.duplicate }).waitFor();
  evidence.checks.push("Real agency component filed two distinct categories for one audience member; exact duplicate returned 409; two Report documents verified");
  assert.equal(await agencyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const smallButtons = await agencyPage.locator("button:visible").evaluateAll((buttons) => buttons.filter((b) => b.getBoundingClientRect().height < 44).length);
  assert.equal(smallButtons, 0); await agencyPage.screenshot({ path: path.join(folder, "agency-es-mobile.png"), fullPage: true });
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const adminPage = await adminContext.newPage(); watchErrors(adminPage);
  adminPage.on("response", async response => {
    if (response.request().method() === "PATCH" && response.url().includes("/api/admin/reports/")) {
      const data = await response.json().catch(() => ({}));
      evidence.moderationResponse = { status: response.status(), ok: data.ok, message: data.message };
      console.log("Moderation response:", JSON.stringify(evidence.moderationResponse));
    }
  });
  await adminPage.goto(address + "/?view=admin&lang=es");
  await adminPage.getByText(es.agencySupervision.moderationSource, { exact: true }).filter({ visible: true }).first().waitFor();
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await adminPage.screenshot({ path: path.join(folder, "admin-pending-es-mobile.png"), fullPage: true });
  const completion = adminPage.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes("/api/admin/reports/"));
  await adminPage.getByRole("button", { name: "✓ " + es.adminReports.actions.reviewed, exact: true }).filter({ visible: true }).first().click();
  assert.equal((await completion).status(), 200);
  for (let i = 0; i < 40 && !await Report.countDocuments({ status: "reviewed" }); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await Report.countDocuments({ status: "reviewed" }), 1);
  assert.equal(String((await Audit.findOne({ action: "update_report" })).staffId), String(admin._id));
  await adminPage.getByRole("button", { name: "✅ " + es.adminReports.tabs.reviewed, exact: true }).click();
  await adminPage.getByText(es.agencySupervision.moderationSource, { exact: true }).filter({ visible: true }).first().waitFor();
  await adminPage.getByText("reviewed", { exact: true }).filter({ visible: true }).first().waitFor();
  evidence.checks.push("Actual Admin Reports mobile view displayed agency context and centrally resolved the persisted report with StaffAuditLog evidence");
  await User.updateOne({ _id: agency._id }, { "agencyProfile.enabled": false });
  await agencyPage.clock.fastForward(30001);
  await agencyPage.getByRole("alert").filter({ hasText: es.agencySupervision.accessRevoked }).waitFor();
  assert.equal(await agencyPage.getByText(live.title, { exact: false }).count(), 0);
  assert.equal(await agencyPage.locator("#agency-report-reason").count(), 0);
  assert.equal(await agencyPage.getByText("@" + viewer.username, { exact: false }).count(), 0);
  await User.updateOne({ _id: agency._id }, { "agencyProfile.enabled": true });
  await agencyPage.clock.fastForward(30001);
  assert.equal(await agencyPage.getByText(live.title, { exact: false }).count(), 0);
  await agencyPage.screenshot({ path: path.join(folder, "agency-revoked-mobile.png"), fullPage: true });
  await agencyPage.getByRole("button", { name: es.agencySupervision.refresh, exact: true }).click();
  await agencyPage.getByRole("button", { name: es.agencySupervision.audience, exact: true }).waitFor();
  evidence.checks.push("Server-side agency revocation produced 403 during polling, removed streams/audience/form, and required explicit refresh after restoration");
  for (const lang of ["en", "pt"]) {
    const languageContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await languageContext.newPage(); watchErrors(page); await page.goto(address + "/?lang=" + lang);
    await page.getByRole("heading", { name: dictionaries[lang].agencySupervision.title }).waitFor();
    await page.getByRole("button", { name: dictionaries[lang].agencySupervision.audience, exact: true }).click();
    await page.getByText("@" + viewer.username, { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(folder, `agency-${lang}-mobile.png`), fullPage: true });
  }
  await agencyPage.setViewportSize({ width: 1280, height: 900 });
  await agencyPage.screenshot({ path: path.join(folder, "agency-desktop.png"), fullPage: true });
  evidence.checks.push("390×844 mobile layout in ES/EN/PT, long title wrapping, 44px agency targets and 1280px desktop screenshot");
  assert.deepEqual(evidence.browserErrors, []); evidence.success = true;
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) { evidence.failure = error.message; throw error;
} finally {
  await writeFile(path.join(folder, "results.json"), JSON.stringify(evidence, null, 2));
  await browser?.close(); timers.forEach(clearInterval); if (io) await new Promise((resolve) => io.close(resolve));
  if (mongoose.connection.readyState) {
    if (live) backend("../backend/src/lib/socket.js").clearLiveRoomState(String(live._id));
    // Remove ONLY records created by this fixture, including partial failures.
    if (accounts[0]) {
      await mongoose.models.Report?.deleteMany({ reporter: accounts[0]._id });
      await mongoose.models.AgencyReportGuard?.deleteMany({ _id: accounts[0]._id });
      await mongoose.models.AgencyRelationship?.deleteMany({ parentCreator: accounts[0]._id });
    }
    if (accounts[3]) await mongoose.models.StaffAuditLog?.deleteMany({ staffId: accounts[3]._id });
    if (live) await mongoose.models.Live?.deleteOne({ _id: live._id });
    if (accounts.length) await mongoose.models.User?.deleteMany({ _id: { $in: accounts.map((user) => user._id) } });
    await mongoose.disconnect();
  }
}

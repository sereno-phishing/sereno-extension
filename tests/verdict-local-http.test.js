"use strict";

/* Real loopback contract of the verdict pipeline and backend-owned data:
   verdict (stand-in classifier + cache), history, cache, metrics and model
   version, served by the sibling backend with isolated temporary JSON files.
   The backend answers the model verdict and the domain policy; the extension
   applies the policy, which the history use case shows here end to end. Node
   supplies one cookie jar per account; the production remote adapter and the
   history use case run unchanged. Never touches the backend's data/*.json. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");
const { load } = require("./load");

const backend = path.resolve(__dirname, "../../sereno-backend");
const python = path.join(backend, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const Sereno = load(
  "time/domain/time.js", "verdict/domain/verdict.js", "history/domain/history.js", "administration/domain/verdict-cache.js",
  "platform/providers/errors.js", "history/application/history-service.js", "platform/providers/remote.js"
);

const URLS = {
  safe: "https://tienda-servicios.pe/reservas",
  warn: "https://paypal-secure-login.com/login",
  block: "https://pago-servicios-linea.net/checkout"
};

function replaceRole(dataFile, username, role) {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  data.users[username].role = role;
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

async function startBackend(t, files) {
  const script = [
    "from app import create_app",
    "from werkzeug.serving import make_server",
    "import sys",
    "app = create_app({'DATA_FILE': sys.argv[1], 'SURVEY_DATA_FILE': sys.argv[2], 'POLICY_DATA_FILE': sys.argv[3],",
    "                  'CACHE_DATA_FILE': sys.argv[4], 'HISTORY_DATA_FILE': sys.argv[5], 'QUERY_LOG_DATA_FILE': sys.argv[6],",
    "                  'STORAGE_DRIVER': 'json', 'AUTH_LOCAL_HTTP': True, 'CLASSIFIER': 'fake'})",
    "server = make_server('127.0.0.1', 0, app)",
    "print(server.server_port, flush=True)",
    "server.serve_forever()"
  ].join("\n");
  const args = [files.auth, files.surveys, files.policies, files.cache, files.history, files.queries];
  const child = spawn(python, ["-u", "-c", script, ...args], { cwd: backend, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit");
      child.kill();
      await stopped;
    }
  });
  const lines = createInterface({ input: child.stdout });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Backend startup timed out: " + diagnostics)), 5000);
    lines.once("line", (line) => { clearTimeout(timer); resolve(Number(line)); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Backend exited: " + diagnostics)); });
  });
  assert.ok(Number.isInteger(port) && port > 0);
  return "http://127.0.0.1:" + port;
}

/* One remote adapter per browser profile: each keeps its own session cookie. */
function client(baseUrl) {
  let cookie = "";
  async function cookieFetch(url, init) {
    const response = await fetch(url, { ...init, headers: { ...init.headers, Cookie: cookie } });
    const header = response.headers.get("set-cookie");
    if (header) {
      cookie = header.split(";")[0];
    }
    return response;
  }
  return Sereno.providers.remote.create({ baseUrl, timeoutMs: 2000, fetch: cookieFetch });
}

test("remote verdicts, history, cache, metrics and model version run against the real backend", {
  skip: !fs.existsSync(python) && "Sibling backend virtual environment is unavailable",
  timeout: 30000
}, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sereno-verdict-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = (name) => path.join(directory, name);
  const files = {
    auth: file("auth.json"), surveys: file("surveys.json"), policies: file("policies.json"),
    cache: file("cache.json"), history: file("history.json"), queries: file("queries.json")
  };
  const baseUrl = await startBackend(t, files);
  const anonymous = client(baseUrl);
  const user = client(baseUrl);
  const admin = client(baseUrl);

  // Public routes: the model version and verdicts need no session.
  assert.deepEqual(await anonymous.data.getModelVersion(), { ok: true, version: "2.0.0" });
  const safe = await anonymous.verdict.evaluate(URLS.safe);
  assert.equal(safe.ok, true);
  assert.deepEqual({ domain: safe.domain, verdict: safe.verdict, policy: safe.policy, source: safe.source },
    { domain: "tienda-servicios.pe", verdict: "legitima", policy: "advertencia", source: "modelo" });
  assert.equal(typeof safe.score, "number");
  assert.equal(typeof safe.latencyMs, "number");
  assert.equal("status" in safe, false);
  const again = await anonymous.verdict.evaluate(URLS.safe);
  assert.equal(again.source, "cache");
  assert.equal(again.verdict, "legitima");

  // The administrator gives one phishing domain the block policy; the other keeps the default.
  assert.equal((await admin.auth.register("verdict-admin", "throwaway-password")).ok, true);
  replaceRole(files.auth, "verdict-admin", "admin");
  assert.equal((await admin.auth.session()).session.isAdmin, true);
  assert.equal((await admin.data.putDomainPolicies([{ domain: "pago-servicios-linea.net", policy: "bloqueo", updatedAt: "2026-11-13" }])).ok, true);

  // History: signed out is no history; signed in records each evaluated site.
  assert.deepEqual(await anonymous.data.listHistory(), { ok: false, error: "invalid" });
  assert.deepEqual(await Sereno.historyService.list({ data: anonymous.data }), { ok: true, entries: [] });
  assert.deepEqual(await Sereno.historyService.clear({ data: anonymous.data }), { ok: true });

  assert.equal((await user.auth.register("verdict-user", "throwaway-password")).ok, true);
  assert.deepEqual(await user.data.listHistory(), { ok: true, entries: [] });
  const warn = await user.verdict.evaluate(URLS.warn);
  assert.deepEqual([warn.verdict, warn.policy, warn.source], ["phishing", "advertencia", "modelo"]);
  const block = await user.verdict.evaluate(URLS.block);
  assert.deepEqual([block.verdict, block.policy, block.source], ["phishing", "bloqueo", "modelo"]);
  const blockAgain = await user.verdict.evaluate(URLS.block);
  assert.deepEqual([blockAgain.verdict, blockAgain.policy, blockAgain.source], ["phishing", "bloqueo", "cache"]);
  const listed = await Sereno.historyService.list({ data: user.data });
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.entries.map((entry) => [entry.domain, entry.status]),
    [["pago-servicios-linea.net", "bloqueo"], ["paypal-secure-login.com", "advertencia"]],
    "newest first, the repeated visit deduplicated, anonymous visits not recorded, each with its domain policy applied");
  assert.ok(listed.entries.every((entry) => typeof entry.id === "string" && typeof entry.ts === "string"));
  assert.deepEqual(await user.data.deleteHistory(), { ok: true });
  assert.deepEqual(await user.data.listHistory(), { ok: true, entries: [] });

  // Cache and metrics are administrator-only.
  const cacheBytes = fs.existsSync(files.cache) ? fs.readFileSync(files.cache) : null;
  assert.deepEqual(await anonymous.data.getCache(), { ok: false, error: "invalid" });
  for (const call of [
    () => user.data.getCache(),
    () => user.data.setCacheTtl(1, 1),
    () => user.data.invalidateCache("tienda-servicios.pe"),
    () => user.data.getMetrics()
  ]) {
    assert.deepEqual(await call(), { ok: false, error: "forbidden" });
  }
  assert.deepEqual(fs.existsSync(files.cache) ? fs.readFileSync(files.cache) : null, cacheBytes, "user rejections do not mutate the cache");

  assert.deepEqual(await admin.data.getCache(), { ok: true, cache: { ttlPhishingDays: 7, ttlLegitHours: 24, invalidations: [] } });
  assert.deepEqual(await admin.data.setCacheTtl(10, 12), { ok: true, cache: { ttlPhishingDays: 10, ttlLegitHours: 12, invalidations: [] } });
  assert.deepEqual(await admin.data.setCacheTtl(0, 12), { ok: false, error: "invalid" });

  const invalidated = await admin.data.invalidateCache("tienda-servicios.pe");
  assert.equal(invalidated.ok, true);
  assert.equal(invalidated.cache.invalidations.length, 1);
  assert.equal(invalidated.cache.invalidations[0].domain, "tienda-servicios.pe");
  assert.match(invalidated.cache.invalidations[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await anonymous.verdict.evaluate(URLS.safe)).source, "modelo", "an invalidated domain goes back to the model");
  const reevaluated = (await admin.data.getCache()).cache.invalidations[0];
  assert.equal("status" in reevaluated, false);
  assert.equal(Sereno.verdictCache.statusText(reevaluated), "Reevaluado: legítimo");

  const metrics = await admin.data.getMetrics();
  assert.equal(metrics.ok, true);
  assert.equal(metrics.metrics.analyzed, 6, "every verdict counts, anonymous included");
  assert.equal(metrics.metrics.phishingCount, 3);
  assert.equal(metrics.metrics.cacheHitPct, 33);
  assert.equal(metrics.metrics.queries.length, 6);
  assert.ok(Array.isArray(metrics.metrics.hourly) && metrics.metrics.sparklines);

  // A broken cache store is reported as cache_down, never as a verdict.
  fs.writeFileSync(files.cache, "{");
  assert.deepEqual(await anonymous.verdict.evaluate(URLS.block), { ok: false, error: "cache_down" });
  assert.deepEqual(await admin.data.getCache(), { ok: false, error: "cache_down" });
});

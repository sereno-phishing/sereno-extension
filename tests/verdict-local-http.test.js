"use strict";

/* Real loopback contract of the verdict pipeline and backend-owned data:
   verdict (stand-in classifier + cache), history, cache, metrics and model
   version, served by the sibling backend on its own PostgreSQL database and
   Redis index (tests/local-backend.js).
   The backend answers the model verdict and the domain policy; the extension
   applies the policy, which the history use case shows here end to end. Node
   supplies one cookie jar per account; the production remote adapter and the
   history use case run unchanged. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { unavailable, startBackend } = require("./local-backend");

const Sereno = load(
  "time/domain/time.js", "verdict/domain/verdict.js", "history/domain/history.js", "administration/domain/verdict-cache.js",
  "platform/providers/errors.js", "history/application/history-service.js", "platform/providers/remote.js"
);

const URLS = {
  safe: "https://tienda-servicios.pe/reservas",
  warn: "https://paypal-secure-login.com/login",
  block: "https://pago-servicios-linea.net/checkout"
};

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
  skip: unavailable(),
  timeout: 120000
}, async (t) => {
  const backend = await startBackend(t, { name: "verdict", redisIndex: 14 });
  const baseUrl = backend.baseUrl;
  const anonymous = client(baseUrl);
  const user = client(baseUrl);
  const admin = client(baseUrl);

  // Public routes: the model version and verdicts need no session.
  assert.deepEqual(await anonymous.data.getModelVersion(), { ok: true, version: "1.3" }, "the stand-in classifier reports its own version");
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
  /* What an operator does by hand: the product API has no promotion route. */
  assert.equal(backend.sql("UPDATE usuario SET rol = 'admin' WHERE nombre = %s", ["verdict-admin"]).count, 1);
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
  const cacheState = () => ({
    entries: backend.redisSnapshot(),
    settings: backend.sql("SELECT * FROM configuracion_cache").rows,
    invalidations: backend.sql("SELECT * FROM invalidacion_cache ORDER BY 1").rows
  });
  const cacheBefore = cacheState();
  assert.ok(Object.keys(cacheBefore.entries).length > 0, "the evaluated sites are cached");
  assert.deepEqual(await anonymous.data.getCache(), { ok: false, error: "invalid" });
  for (const call of [
    () => user.data.getCache(),
    () => user.data.setCacheTtl(1, 1),
    () => user.data.invalidateCache("tienda-servicios.pe"),
    () => user.data.getMetrics()
  ]) {
    assert.deepEqual(await call(), { ok: false, error: "forbidden" });
  }
  assert.deepEqual(cacheState(), cacheBefore, "user rejections do not mutate the cache entries, its settings or its invalidations");

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

  // A broken cache store is reported as cache_down, never as a verdict: first
  // unreadable entries in Redis, then an unreadable settings table in PostgreSQL.
  assert.ok(backend.corruptCacheEntries() > 0);
  assert.deepEqual(await anonymous.verdict.evaluate(URLS.block), { ok: false, error: "cache_down" });
  backend.sql("ALTER TABLE configuracion_cache RENAME TO configuracion_cache_broken");
  assert.deepEqual(await admin.data.getCache(), { ok: false, error: "cache_down" });
  assert.deepEqual(await anonymous.verdict.evaluate(URLS.warn), { ok: false, error: "cache_down" });
});

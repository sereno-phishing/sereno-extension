"use strict";

/* Provider seam: the remote adapter satisfies every port, its failures map
   to typed errors, and the composition root builds the services from config.
   The adapter runs against the test-only REST fake (tests/rest-fake.js), which
   serves the documented REST contract. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { createRestFake } = require("./rest-fake");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "account/domain/account.js",
  "history/domain/history.js",
  "survey/domain/sus.js",
  "administration/domain/domain-policy.js",
  "administration/domain/verdict-cache.js",
  "protection/domain/protection.js",
  "demo-store/domain/scenarios.js",
  "account/application/account-service.js",
  "history/application/history-service.js",
  "survey/application/survey-service.js",
  "administration/application/administration-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/config.js",
  "platform/providers/ports.js",
  "platform/providers/mock.js",
  "platform/providers/remote.js",
  "platform/providers/index.js"
);

const { providers } = Sereno;
const NOW = () => new Date(2026, 8, 21, 11, 30, 0);
const BASE_URL = "https://api.sereno.test";

function openStore() {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
}

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeBackend() {
  return createRestFake({ baseUrl: BASE_URL, now: NOW });
}

function newRemote(fetchImpl, extra) {
  return providers.remote.create(Object.assign({ baseUrl: BASE_URL + "/", timeoutMs: 50, fetch: fetchImpl }, extra));
}

const make = () => newRemote(fakeBackend());

test("the remote adapter implements every port method", () => {
  const adapter = make();
  Object.keys(providers.ports.METHODS).forEach((port) => {
    providers.ports.METHODS[port].forEach((method) => {
      assert.equal(typeof adapter[port][method], "function", port + "." + method);
    });
  });
});

test("verdict.evaluate returns the verdict shape", async () => {
  const { verdict } = make();
  const blocked = await verdict.evaluate("https://pago-servicios-linea.net/checkout?x=1");
  assert.equal(blocked.ok, true);
  assert.deepEqual([blocked.verdict, blocked.policy], ["phishing", "bloqueo"]);
  assert.equal("status" in blocked, false);
  assert.equal(blocked.source, "cache");
  assert.equal(typeof blocked.score, "number");
  assert.equal(typeof blocked.latencyMs, "number");
  const unknown = await verdict.evaluate("https://www.example-shop.pe/");
  assert.equal(unknown.ok, true);
  assert.ok(Sereno.verdict.VERDICTS.includes(Sereno.verdict.applyPolicy(unknown.verdict, unknown.policy)));
  assert.ok(Sereno.verdict.POLICIES.includes(unknown.policy), "the policy is always present");
});

test("auth covers login, session, register and logout", async () => {
  const { auth } = make();
  assert.deepEqual(await auth.session(), { ok: true, session: null });
  assert.deepEqual(await auth.login("andres.torres", "bad"), { ok: false, error: "invalid" });
  const login = await auth.login("admin.sereno", "sereno123");
  assert.equal(login.ok, true);
  assert.equal(login.user.isAdmin, true);
  assert.equal(typeof login.token, "string");
  assert.ok(login.token.length > 0);
  assert.equal("password" in login.user, false);
  const active = (await auth.session()).session;
  assert.equal(active.username, "admin.sereno");
  assert.equal(active.token, login.token);
  assert.deepEqual(await auth.register("andres.torres", "x"), { ok: false, error: "duplicate" });
  assert.deepEqual(await auth.register("", "x"), { ok: false, error: "invalid" });
  const created = await auth.register("nuevo.usuario", "x");
  assert.equal(created.ok, true);
  assert.equal(created.user.username, "nuevo.usuario");
  assert.equal(created.user.isAdmin, false);
  assert.equal(typeof created.token, "string");
  assert.equal("password" in created.user, false);
  assert.equal((await auth.session()).session.username, "nuevo.usuario");
  assert.equal((await auth.logout()).ok, true);
  assert.equal((await auth.session()).session, null);
});

test("data lists and deletes the history of the signed-in user and answers invalid when signed out", async () => {
  const { auth, data } = make();
  assert.deepEqual(await data.listHistory(), { ok: false, error: "invalid" });
  assert.deepEqual(await data.deleteHistory(), { ok: false, error: "invalid" });
  await auth.login("andres.torres", "sereno123");
  const listed = await data.listHistory();
  assert.equal(listed.ok, true);
  assert.equal(listed.entries.length, 6);
  assert.deepEqual(Object.keys(listed.entries[0]).sort(), ["domain", "id", "latencyMs", "policy", "score", "source", "ts", "verdict"]);
  assert.deepEqual(listed.entries.map((entry) => [entry.verdict, entry.policy]), [
    ["phishing", "bloqueo"], ["legitima", "advertencia"], ["phishing", "advertencia"],
    ["legitima", "advertencia"], ["phishing", "advertencia"], ["legitima", "advertencia"]
  ]);
  assert.equal((await data.deleteHistory()).ok, true);
  assert.deepEqual(await data.listHistory(), { ok: true, entries: [] });
});

test("data reads and writes the domain policy for an administrator", async () => {
  const { auth, data } = make();
  await auth.login("admin.sereno", "sereno123");
  const before = await data.getDomainPolicies();
  assert.equal(before.ok, true);
  assert.equal(before.domains.length, 3);
  const rows = [{ domain: "nuevo.example", policy: "bloqueo", updatedAt: "2026-09-21" }].concat(before.domains);
  assert.equal((await data.putDomainPolicies(rows)).ok, true);
  assert.deepEqual((await data.getDomainPolicies()).domains, rows);
});

test("data manages the verdict cache for an administrator", async () => {
  const { auth, data } = make();
  await auth.login("admin.sereno", "sereno123");
  const initial = await data.getCache();
  assert.equal(initial.ok, true);
  assert.equal(initial.cache.ttlPhishingDays, 7);
  assert.equal(initial.cache.ttlLegitHours, 24);
  const ttl = await data.setCacheTtl(14, 12);
  assert.equal(ttl.ok, true);
  assert.equal(ttl.cache.ttlPhishingDays, 14);
  assert.equal(ttl.cache.ttlLegitHours, 12);
  const invalidated = await data.invalidateCache("tienda-servicios.pe");
  assert.equal(invalidated.ok, true);
  assert.deepEqual(Object.keys(invalidated.cache.invalidations[0]).sort(), ["date", "domain", "verdict"]);
  assert.equal(invalidated.cache.invalidations[0].domain, "tienda-servicios.pe");
  assert.ok(initial.cache.invalidations.every((item) => !("status" in item)));
  assert.deepEqual((await data.getCache()).cache, invalidated.cache);
});

test("data serves the metrics to an administrator and the model version to everyone", async () => {
  const { auth, data } = make();
  assert.deepEqual(await data.getModelVersion(), { ok: true, version: "2.0.0" });
  await auth.login("admin.sereno", "sereno123");
  const metrics = await data.getMetrics();
  assert.equal(metrics.ok, true);
  assert.equal(metrics.metrics.analyzed, 1284);
  assert.deepEqual(await data.getModelVersion(), { ok: true, version: "2.0.0" });
});

test("administrator-only data answers invalid without a session and forbidden for a user", async () => {
  const { auth, data } = make();
  const requests = [() => data.getDomainPolicies(), () => data.putDomainPolicies([]), () => data.getCache(), () => data.setCacheTtl(7, 24), () => data.invalidateCache("a.pe"), () => data.getMetrics()];
  for (const request of requests) {
    assert.deepEqual(await request(), { ok: false, error: "invalid" });
  }
  await auth.login("andres.torres", "sereno123");
  for (const request of requests) {
    assert.deepEqual(await request(), { ok: false, error: "forbidden" });
  }
});

test("remote survey checks status and submits the exact JSON contract once per account", async () => {
  const fetchFake = fakeBackend();
  const { auth, survey } = newRemote(fetchFake);
  const answers = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
  assert.deepEqual(await survey.status(), { ok: false, error: "invalid" });
  await auth.login("andres.torres", "sereno123");
  fetchFake.calls.length = 0;
  assert.deepEqual(await survey.status(), { ok: true, submitted: false });
  assert.deepEqual(await survey.submit(answers), { ok: true });
  assert.equal(fetchFake.calls[0].method, "GET");
  assert.equal(fetchFake.calls[0].body, undefined);
  assert.deepEqual(fetchFake.calls[1].body, { answers });
  assert.deepEqual(await survey.status(), { ok: true, submitted: true });
  assert.deepEqual(await survey.submit(answers), { ok: false, error: "already_submitted" });
});

test("remote sends JSON to baseUrl without a double slash", async () => {
  const fetchFake = fakeBackend();
  const { verdict } = newRemote(fetchFake);
  await verdict.evaluate("https://tienda-servicios.pe/");
  assert.equal(fetchFake.calls.length, 1);
  assert.equal(fetchFake.calls[0].method, "POST");
  assert.equal(fetchFake.calls[0].path, "/v1/verdict");
  assert.deepEqual(fetchFake.calls[0].body, { url: "https://tienda-servicios.pe/" });
});

test("remote maps a network failure to offline", async () => {
  const remote = newRemote(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await remote.verdict.evaluate("https://a.pe/"), { ok: false, error: "offline" });
  assert.deepEqual(await remote.data.getMetrics(), { ok: false, error: "offline" });
});

test("remote maps a hung request to timeout and aborts it", async () => {
  let signal = null;
  const remote = newRemote((url, init) => {
    signal = init.signal;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  });
  assert.deepEqual(await remote.verdict.evaluate("https://a.pe/"), { ok: false, error: "timeout" });
  assert.equal(signal.aborted, true);
});

test("remote maps server failures, cache outage and admin-only authorization", async () => {
  const failing = (status, body) => newRemote(async () => reply(status, body));
  assert.deepEqual(await failing(500, {}).verdict.evaluate("https://a.pe/"), { ok: false, error: "server" });
  assert.deepEqual(await failing(503, { error: "cache_down" }).verdict.evaluate("https://a.pe/"), { ok: false, error: "cache_down" });
  assert.deepEqual(await failing(404, { error: "weird" }).data.getCache(), { ok: false, error: "server" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.getDomainPolicies(), { ok: false, error: "forbidden" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.putDomainPolicies([]), { ok: false, error: "forbidden" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.getCache(), { ok: false, error: "forbidden" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.setCacheTtl(7, 24), { ok: false, error: "forbidden" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.invalidateCache("a.pe"), { ok: false, error: "forbidden" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.getMetrics(), { ok: false, error: "forbidden" });
  assert.deepEqual(await failing(503, { error: "cache_down" }).data.setCacheTtl(7, 24), { ok: false, error: "cache_down" });
  assert.deepEqual(await failing(401, { error: "invalid" }).data.listHistory(), { ok: false, error: "invalid" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.listHistory(), { ok: false, error: "server" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).data.getModelVersion(), { ok: false, error: "server" });
  assert.deepEqual(await failing(403, { error: "forbidden" }).survey.status(), { ok: false, error: "server" });
  const malformed = newRemote(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }));
  assert.deepEqual(await malformed.data.getCache(), { ok: false, error: "server" });
});

test("composition root picks the adapter from config", () => {
  const store = openStore();
  const mocked = providers.create({ config: { provider: "mock", baseUrl: "", timeoutMs: 100 }, store });
  assert.equal(mocked.provider, "mock");
  const remote = providers.create({ config: { provider: "remote", baseUrl: BASE_URL, timeoutMs: 100 }, fetch: async () => reply(200, {}) });
  assert.equal(remote.provider, "remote");
  assert.deepEqual(Object.keys(remote).sort(), ["auth", "data", "provider", "survey", "verdict"]);
  assert.throws(() => providers.create({ config: { provider: "carrier-pigeon" } }), /provider/);
});

test("the default config serves verdicts, data, auth and policies from the backend", async () => {
  assert.equal(providers.config.provider, "remote");
  assert.equal(providers.config.authProvider, "remote");
  assert.equal(providers.config.policyProvider, "remote");
  assert.equal(Sereno.services.provider, "remote");
  assert.deepEqual(Object.keys(Sereno.services).sort(), ["auth", "data", "provider", "survey", "verdict"]);
});

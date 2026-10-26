"use strict";

/* Provider seam: the mock and remote adapters must satisfy the same ports,
   remote failures map to typed errors, and the composition root picks the
   adapter from config. The remote adapter runs against a fake fetch that
   serves the documented REST contract on top of the mock adapter. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

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

function newMock() {
  return providers.mock.create({ store: openStore(), delayMs: 0, now: NOW });
}

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/* Serves the REST contract documented in remote.js by delegating to a mock. */
function fakeBackend(mock) {
  const calls = [];
  async function fetchFake(url, init) {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    const path = url.slice(BASE_URL.length);
    calls.push({ method, path, body, signal: init && init.signal });
    const key = method + " " + path;
    const route = {
      "POST /v1/verdict": () => mock.verdict.evaluate(body.url),
      "POST /v1/auth/login": async () => {
        const out = await mock.auth.login(body.username, body.password);
        return out.ok ? reply(200, out) : reply(401, out);
      },
      "POST /v1/auth/register": async () => {
        const out = await mock.auth.register(body.username, body.password);
        return out.ok ? reply(201, out) : reply(out.error === "invalid" ? 400 : 409, out);
      },
      "POST /v1/auth/logout": () => mock.auth.logout(),
      "GET /v1/auth/session": () => mock.auth.session(),
      "GET /v1/history": () => mock.data.listHistory(),
      "DELETE /v1/history": () => mock.data.deleteHistory(),
      "GET /v1/domains": () => mock.data.getDomainPolicies(),
      "PUT /v1/domains": () => mock.data.putDomainPolicies(body.domains),
      "GET /v1/cache": () => mock.data.getCache(),
      "PUT /v1/cache/ttl": () => mock.data.setCacheTtl(body.ttlPhishingDays, body.ttlLegitHours),
      "POST /v1/cache/invalidations": () => mock.data.invalidateCache(body.domain),
      "GET /v1/metrics": () => mock.data.getMetrics(),
      "GET /v1/model": () => mock.data.getModelVersion(),
      "POST /v1/survey": () => mock.data.submitSurvey(body.answers)
    }[key];
    if (!route) {
      return reply(404, { error: "server" });
    }
    const out = await route();
    return out && typeof out.status === "number" && typeof out.json === "function" ? out : reply(200, out);
  }
  fetchFake.calls = calls;
  return fetchFake;
}

function newRemote(fetchImpl, extra) {
  return providers.remote.create(Object.assign({ baseUrl: BASE_URL + "/", timeoutMs: 50, fetch: fetchImpl }, extra));
}

const ADAPTERS = {
  mock: () => newMock(),
  remote: () => newRemote(fakeBackend(newMock()))
};

Object.keys(ADAPTERS).forEach((name) => {
  const make = ADAPTERS[name];

  test(name + " adapter implements every port method", () => {
    const adapter = make();
    ["verdict", "auth", "data"].forEach((port) => {
      providers.ports.METHODS[port].forEach((method) => {
        assert.equal(typeof adapter[port][method], "function", port + "." + method);
      });
    });
  });

  test(name + " verdict.evaluate returns the verdict shape", async () => {
    const { verdict } = make();
    const blocked = await verdict.evaluate("https://pago-servicios-linea.net/checkout?x=1");
    assert.equal(blocked.ok, true);
    assert.equal(blocked.status, "bloqueo");
    assert.equal(blocked.source, "cache");
    assert.equal(typeof blocked.score, "number");
    assert.equal(typeof blocked.latencyMs, "number");
    const unknown = await verdict.evaluate("https://www.example-shop.pe/");
    assert.equal(unknown.ok, true);
    assert.ok(Sereno.verdict.VERDICTS.includes(unknown.status));
  });

  test(name + " auth covers login, session, register and logout", async () => {
    const { auth } = make();
    assert.deepEqual(await auth.session(), { ok: true, session: null });
    assert.deepEqual(await auth.login("andres.torres", "bad"), { ok: false, error: "invalid" });
    const login = await auth.login("admin.sereno", "sereno123");
    assert.equal(login.ok, true);
    assert.equal(login.user.role, "administrador");
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
    assert.equal(created.user.role, "usuario");
    assert.equal(typeof created.token, "string");
    assert.equal("password" in created.user, false);
    assert.equal((await auth.session()).session.username, "nuevo.usuario");
    assert.equal((await auth.logout()).ok, true);
    assert.equal((await auth.session()).session, null);
  });

  test(name + " data lists and deletes the history of the signed-in user", async () => {
    const { auth, data } = make();
    assert.deepEqual(await data.listHistory(), { ok: true, entries: [] });
    await auth.login("andres.torres", "sereno123");
    const listed = await data.listHistory();
    assert.equal(listed.ok, true);
    assert.equal(listed.entries.length, 6);
    assert.deepEqual(Object.keys(listed.entries[0]).sort(), ["domain", "id", "latencyMs", "score", "source", "status", "ts"]);
    assert.equal((await data.deleteHistory()).ok, true);
    assert.deepEqual(await data.listHistory(), { ok: true, entries: [] });
  });

  test(name + " data reads and writes the domain policy", async () => {
    const { data } = make();
    const before = await data.getDomainPolicies();
    assert.equal(before.ok, true);
    assert.equal(before.domains.length, 3);
    const rows = [{ domain: "nuevo.example", policy: "bloqueo", updatedAt: "2026-09-21" }].concat(before.domains);
    assert.equal((await data.putDomainPolicies(rows)).ok, true);
    assert.deepEqual((await data.getDomainPolicies()).domains, rows);
  });

  test(name + " data manages the verdict cache", async () => {
    const { data } = make();
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
    assert.equal(invalidated.cache.invalidations[0].domain, "tienda-servicios.pe");
    assert.deepEqual((await data.getCache()).cache, invalidated.cache);
  });

  test(name + " data serves metrics, model version and survey submission", async () => {
    const { data } = make();
    const metrics = await data.getMetrics();
    assert.equal(metrics.ok, true);
    assert.equal(metrics.metrics.analyzed, 1284);
    assert.deepEqual(await data.getModelVersion(), { ok: true, version: "1.3" });
    assert.deepEqual(await data.submitSurvey([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), { ok: true });
  });
});

test("mock verdict waits for the injected delay only", async () => {
  const slow = providers.mock.create({ store: openStore(), delayMs: 30, now: NOW });
  const started = Date.now();
  await slow.verdict.evaluate("https://tienda-servicios.pe/");
  assert.ok(Date.now() - started >= 25);
  const fast = newMock();
  const t0 = Date.now();
  await fast.verdict.evaluate("https://tienda-servicios.pe/");
  assert.ok(Date.now() - t0 < 25);
});

test("remote sends JSON to baseUrl without a double slash", async () => {
  const fetchFake = fakeBackend(newMock());
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

test("remote maps server failures and the cache outage", async () => {
  const failing = (status, body) => newRemote(async () => reply(status, body));
  assert.deepEqual(await failing(500, {}).verdict.evaluate("https://a.pe/"), { ok: false, error: "server" });
  assert.deepEqual(await failing(503, { error: "cache_down" }).verdict.evaluate("https://a.pe/"), { ok: false, error: "cache_down" });
  assert.deepEqual(await failing(404, { error: "weird" }).data.getCache(), { ok: false, error: "server" });
  const malformed = newRemote(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }));
  assert.deepEqual(await malformed.data.getCache(), { ok: false, error: "server" });
});

test("composition root picks the adapter from config", () => {
  const store = openStore();
  const mocked = providers.create({ config: { provider: "mock", baseUrl: "", timeoutMs: 100 }, store });
  assert.equal(mocked.provider, "mock");
  const remote = providers.create({ config: { provider: "remote", baseUrl: BASE_URL, timeoutMs: 100 }, fetch: async () => reply(200, {}) });
  assert.equal(remote.provider, "remote");
  assert.deepEqual(Object.keys(remote).sort(), ["auth", "data", "provider", "verdict"]);
  assert.throws(() => providers.create({ config: { provider: "carrier-pigeon" } }), /provider/);
});

test("the default config ships with the mock provider and Sereno.services uses it", async () => {
  assert.equal(providers.config.provider, "mock");
  assert.equal(Sereno.services.provider, "mock");
  assert.deepEqual(Object.keys(Sereno.services).sort(), ["auth", "data", "provider", "verdict"]);
});

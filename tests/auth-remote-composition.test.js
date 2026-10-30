"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js", "verdict/domain/verdict.js", "account/domain/account.js",
  "history/domain/history.js", "survey/domain/sus.js", "administration/domain/domain-policy.js",
  "administration/domain/verdict-cache.js", "protection/domain/protection.js", "demo-store/domain/scenarios.js",
  "account/application/account-service.js", "platform/storage.js", "platform/seed.js", "platform/state-store.js",
  "platform/providers/config.js", "platform/providers/ports.js", "platform/providers/mock.js",
  "platform/providers/remote.js", "platform/providers/index.js"
);

function openStore() {
  return Sereno.stateStore.create({ storage: Sereno.storage.memoryStorage(), key: "auth-test", defaults: Sereno.seed.defaultState });
}

function compose(store, fetch) {
  return Sereno.providers.create({ config: { provider: "mock", authProvider: "remote", policyProvider: "remote", baseUrl: "http://127.0.0.1:5000" }, store, fetch, delayMs: 0 });
}

test("local defaults route authentication, surveys and domain policies to the backend", () => {
  assert.equal(Sereno.providers.config.provider, "mock");
  assert.equal(Sereno.providers.config.authProvider, "remote");
  assert.equal(Sereno.providers.config.policyProvider, "remote");
  assert.equal(Sereno.providers.config.baseUrl, "http://127.0.0.1:5000");
  assert.equal(typeof Sereno.services.survey.status, "function");
  assert.equal(typeof Sereno.services.survey.submit, "function");
  assert.equal(typeof Sereno.services.data.submitSurvey, "undefined");
});

test("survey and policies are remote while verdict, history, cache and metrics remain local", async () => {
  const store = openStore();
  const calls = [];
  const services = compose(store, async (url, init) => {
    calls.push({ url, init });
    const pathname = new URL(url).pathname;
    if (pathname === "/v1/domains") {
      return { ok: true, status: 200, json: async () => ({ domains: [] }) };
    }
    return { ok: true, status: 200, json: async () => (init.method === "GET" ? { submitted: false } : {}) };
  });
  assert.equal((await services.verdict.evaluate("https://tienda-servicios.pe")).ok, true);
  assert.equal((await services.data.getMetrics()).metrics.analyzed, 1284);
  assert.equal((await services.data.getCache()).cache.ttlPhishingDays, 7);
  assert.equal((await services.data.listHistory()).entries.length, 0);
  assert.deepEqual(await services.data.getDomainPolicies(), { ok: true, domains: [] });
  assert.deepEqual(await services.data.putDomainPolicies([]), { ok: true, domains: [] });
  assert.deepEqual(await services.survey.status(), { ok: true, submitted: false });
  assert.deepEqual(await services.survey.submit([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), { ok: true });
  assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.init.method]), [
    ["/v1/domains", "GET"],
    ["/v1/domains", "PUT"],
    ["/v1/survey", "GET"],
    ["/v1/survey", "POST"]
  ]);
  assert.ok(calls.every((call) => call.init.credentials === "include"));
});

test("remote registration keeps verdict and data local and never stores submitted passwords", async () => {
  const store = openStore();
  const calls = [];
  const services = compose(store, async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({ user: { username: "fresh", isAdmin: false, createdAt: "today" }, token: "remote-token" }) };
  });
  const result = await Sereno.accountService.register(services, store, "fresh", "private-input", new Date());
  assert.equal(result.ok, true);
  assert.equal((await services.verdict.evaluate("https://tienda-servicios.pe")).ok, true);
  assert.equal((await services.data.getMetrics()).metrics.analyzed, 1284);
  assert.equal((await services.data.listHistory()).entries.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:5000/v1/auth/register");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: "fresh", password: "private-input" });
  const state = await store.get();
  assert.deepEqual(state.users, []);
  assert.doesNotMatch(JSON.stringify(state), /private-input|sereno123/);
});

for (const error of ["offline", "server", "invalid"]) {
  test("remote " + error + " never authenticates seeded mock credentials", async () => {
    const store = openStore();
    const services = compose(store, async () => {
      if (error === "offline") throw new TypeError("offline");
      return { ok: false, status: error === "invalid" ? 401 : 500, json: async () => ({ error }) };
    });
    const result = await Sereno.accountService.login(services, store, "admin.sereno", "sereno123", new Date());
    assert.equal(result.ok, false);
    assert.equal(result.error, error);
    assert.equal((await store.get()).session, null);
    assert.deepEqual((await store.get()).users, []);
  });
}

test("successful restoration replaces a stale local identity with the server session", async () => {
  const store = openStore();
  await store.set({ session: { username: "stale-admin", isAdmin: true, token: "old" } });
  const session = { username: "actual", isAdmin: false, token: "new", loginAt: "2026-10-27T12:00" };
  const services = compose(store, async () => ({ ok: true, status: 200, json: async () => ({ session }) }));
  const result = await Sereno.accountService.currentSession(services, store);
  assert.deepEqual(result, { ok: true, session, verified: true });
  assert.deepEqual((await store.get()).session, session);
});

test("remote restoration drops legacy mock sessions even when offline", async () => {
  const store = openStore();
  await store.set({ session: { username: "admin.sereno", isAdmin: true, token: "mock-legacy" } });
  const services = compose(store, async () => { throw new TypeError("offline"); });
  assert.deepEqual(await Sereno.accountService.currentSession(services, store), { ok: true, session: null, verified: false });
  assert.equal((await store.get()).session, null);
});

test("omitting policyProvider preserves the selected data adapter for explicit configurations", async () => {
  const store = openStore();
  const services = Sereno.providers.create({ config: { provider: "mock", authProvider: "remote", baseUrl: "http://127.0.0.1:5000" }, store, fetch: async () => { throw new Error("policy must stay mock"); }, delayMs: 0 });
  assert.equal((await services.data.getDomainPolicies()).domains.length, 3);
});

test("unknown authentication and policy providers fail closed", () => {
  assert.throws(() => Sereno.providers.create({ config: { provider: "mock", authProvider: "typo" } }), /auth.*provider/i);
  assert.throws(() => Sereno.providers.create({ config: { provider: "mock", policyProvider: "typo" } }), /policy.*provider/i);
});

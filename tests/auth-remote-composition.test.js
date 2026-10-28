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
  return Sereno.providers.create({ config: { provider: "mock", authProvider: "remote", baseUrl: "http://127.0.0.1:5000" }, store, fetch, delayMs: 0 });
}

test("local defaults route authentication and surveys to the backend", () => {
  assert.equal(Sereno.providers.config.provider, "mock");
  assert.equal(Sereno.providers.config.authProvider, "remote");
  assert.equal(Sereno.providers.config.baseUrl, "http://127.0.0.1:5000");
  assert.equal(typeof Sereno.services.survey.status, "function");
  assert.equal(typeof Sereno.services.survey.submit, "function");
  assert.equal(typeof Sereno.services.data.submitSurvey, "undefined");
});

test("survey status and submission are remote while verdict and data remain local", async () => {
  const store = openStore();
  const calls = [];
  const services = compose(store, async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => (init.method === "GET" ? { submitted: false } : {}) };
  });
  assert.equal((await services.verdict.evaluate("https://tienda-servicios.pe")).ok, true);
  assert.equal((await services.data.getMetrics()).metrics.analyzed, 1284);
  assert.deepEqual(await services.survey.status(), { ok: true, submitted: false });
  assert.deepEqual(await services.survey.submit([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://127.0.0.1:5000/v1/survey");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].url, "http://127.0.0.1:5000/v1/survey");
  assert.equal(calls[1].init.method, "POST");
  assert.ok(calls.every((call) => call.init.credentials === "include"));
});

test("remote registration keeps verdict and data local and never stores submitted passwords", async () => {
  const store = openStore();
  const calls = [];
  const services = compose(store, async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({ user: { username: "fresh", role: "usuario", createdAt: "today" }, token: "remote-token" }) };
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
  await store.set({ session: { username: "stale-admin", role: "administrador", token: "old" } });
  const session = { username: "actual", role: "usuario", token: "new", loginAt: "2026-10-27T12:00" };
  const services = compose(store, async () => ({ ok: true, status: 200, json: async () => ({ session }) }));
  const result = await Sereno.accountService.currentSession(services, store);
  assert.deepEqual(result, { ok: true, session, verified: true });
  assert.deepEqual((await store.get()).session, session);
});

test("remote restoration drops legacy mock sessions even when offline", async () => {
  const store = openStore();
  await store.set({ session: { username: "admin.sereno", role: "administrador", token: "mock-legacy" } });
  const services = compose(store, async () => { throw new TypeError("offline"); });
  assert.deepEqual(await Sereno.accountService.currentSession(services, store), { ok: true, session: null, verified: false });
  assert.equal((await store.get()).session, null);
});

test("unknown authentication providers fail closed", () => {
  assert.throws(() => Sereno.providers.create({ config: { provider: "mock", authProvider: "typo" } }), /auth.*provider/i);
});

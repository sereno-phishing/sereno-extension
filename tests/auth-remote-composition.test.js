"use strict";

/* The composed services (Sereno.providers.create) send every port to the
   backend with credentials, and the account use cases keep only the server
   identity: no password and no stale local session. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js", "account/domain/account.js", "account/application/account-service.js",
  "platform/storage.js", "platform/state-store.js",
  "platform/providers/config.js", "platform/providers/ports.js", "platform/providers/remote.js", "platform/providers/index.js"
);

const BASE_URL = "http://127.0.0.1:5000";

function openStore() {
  return Sereno.stateStore.create({ storage: Sereno.storage.memoryStorage(), key: "auth-test", defaults: { session: null } });
}

function compose(fetch) {
  return Sereno.providers.create({ config: { baseUrl: BASE_URL }, fetch });
}

test("the default services reach the local backend and surveys have their own port", () => {
  assert.equal(Sereno.providers.config.baseUrl, BASE_URL);
  assert.equal(typeof Sereno.services.survey.status, "function");
  assert.equal(typeof Sereno.services.survey.submit, "function");
  assert.equal(typeof Sereno.services.data.submitSurvey, "undefined");
});

test("every port sends its request to the backend with credentials", async () => {
  const calls = [];
  const services = compose(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({}) };
  });
  await services.verdict.evaluate("https://tienda-servicios.pe");
  await services.auth.session();
  await services.data.listHistory();
  await services.data.getDomainPolicies();
  await services.data.putDomainPolicies([]);
  await services.data.getCache();
  await services.data.getMetrics();
  await services.data.getModelVersion();
  await services.survey.status();
  await services.survey.submit([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.init.method]), [
    ["/v1/verdict", "POST"],
    ["/v1/auth/session", "GET"],
    ["/v1/history", "GET"],
    ["/v1/domains", "GET"],
    ["/v1/domains", "PUT"],
    ["/v1/cache", "GET"],
    ["/v1/metrics", "GET"],
    ["/v1/model", "GET"],
    ["/v1/survey", "GET"],
    ["/v1/survey", "POST"]
  ]);
  assert.ok(calls.every((call) => call.url.indexOf(BASE_URL + "/v1/") === 0));
  assert.ok(calls.every((call) => call.init.credentials === "include"));
});

test("registration sends the password only to the backend and never stores it", async () => {
  const store = openStore();
  const calls = [];
  const services = compose(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({ user: { username: "fresh", isAdmin: false, createdAt: "today" }, token: "remote-token" }) };
  });
  const result = await Sereno.accountService.register(services, store, "fresh", "private-input", new Date());
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, BASE_URL + "/v1/auth/register");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: "fresh", password: "private-input" });
  const state = await store.get();
  assert.deepEqual(Object.keys(state), ["session"]);
  assert.equal(state.session.token, "remote-token");
  assert.doesNotMatch(JSON.stringify(state), /private-input/);
});

for (const error of ["offline", "server", "invalid"]) {
  test("a login the backend answers with " + error + " opens no session", async () => {
    const store = openStore();
    const services = compose(async () => {
      if (error === "offline") throw new TypeError("offline");
      return { ok: false, status: error === "invalid" ? 401 : 500, json: async () => ({ error }) };
    });
    const result = await Sereno.accountService.login(services, store, "admin.sereno", "sereno123", new Date());
    assert.equal(result.ok, false);
    assert.equal(result.error, error);
    assert.deepEqual(await store.get(), { session: null });
  });
}

test("successful restoration replaces a stale local identity with the server session", async () => {
  const store = openStore();
  await store.set({ session: { username: "stale-admin", isAdmin: true, token: "old" } });
  const session = { username: "actual", isAdmin: false, token: "new", loginAt: "2026-10-27T12:00" };
  const services = compose(async () => ({ ok: true, status: 200, json: async () => ({ session }) }));
  const result = await Sereno.accountService.currentSession(services, store);
  assert.deepEqual(result, { ok: true, session, verified: true });
  assert.deepEqual((await store.get()).session, session);
});

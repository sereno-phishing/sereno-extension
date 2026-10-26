"use strict";

/* Development aid of the mock adapter: *.localhost hosts resolve to the local
   machine in Chrome, so each verdict kind can be exercised on a real page
   (service worker, badge, content script) without a backend. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "account/domain/account.js",
  "history/domain/history.js",
  "administration/domain/domain-policy.js",
  "administration/domain/verdict-cache.js",
  "demo-store/domain/scenarios.js",
  "verdict/application/verdict-service.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "protection/application/navigation-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/errors.js",
  "platform/providers/mock.js"
);

const NOW = () => new Date(2026, 9, 25, 10, 30, 0);
const { SCENARIOS } = Sereno.demoScenarios;

function newMock(extra) {
  const store = Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
  return Sereno.providers.mock.create(Object.assign({ store, delayMs: 0, now: NOW, pendingHostDelayMs: 40 }, extra));
}

function services() {
  return { verdict: newMock().verdict };
}

const HOSTS = [
  ["seguro.localhost", "seguro"],
  ["advertencia.localhost", "advertencia"],
  ["bloqueo.localhost", "bloqueo"]
];

test("scenario hosts return the scenario verdict with the real hostname as domain", async () => {
  for (const [host, name] of HOSTS) {
    const result = await newMock().verdict.evaluate(`http://${host}/`);
    const scenario = SCENARIOS[name];
    assert.deepEqual(result, {
      ok: true,
      domain: host,
      status: scenario.status,
      score: scenario.score,
      source: scenario.source,
      latencyMs: scenario.latencyMs
    });
  }
});

test("through the verdict service every scenario host yields its verdict outcome", async () => {
  for (const [host, name] of HOSTS) {
    const outcome = await Sereno.verdictService.evaluate(services(), `http://${host}:8080/`);
    assert.equal(outcome.kind, "verdict", host);
    assert.equal(outcome.verdict.status, name, host);
    assert.equal(outcome.verdict.domain, host);
  }
});

test("ports and paths in the url are ignored and www. is still stripped", async () => {
  const mock = newMock().verdict;
  assert.equal((await mock.evaluate("http://bloqueo.localhost:8080/a/b?x=1")).status, "bloqueo");
  assert.equal((await mock.evaluate("https://bloqueo.localhost:3000")).status, "bloqueo");
  const www = await mock.evaluate("http://www.advertencia.localhost:8080/");
  assert.equal(www.status, "advertencia");
  assert.equal(www.domain, "advertencia.localhost");
  assert.equal((await mock.evaluate("http://BLOQUEO.LOCALHOST/")).status, "bloqueo");
});

test("unrelated hosts keep today's behavior", async () => {
  const mock = newMock().verdict;
  assert.equal((await mock.evaluate("http://localhost:8080/")).status, "seguro");
  assert.equal((await mock.evaluate("http://otro.localhost/")).status, "seguro");
  assert.equal((await mock.evaluate("http://bloqueo.localhost.evil.com/")).domain, "bloqueo.localhost.evil.com");
  assert.equal((await mock.evaluate("http://bloqueo.localhost.evil.com/")).status, "seguro");
  assert.equal((await mock.evaluate("https://paypal-secure-login.com/")).status, "advertencia");
  assert.equal((await mock.evaluate("https://pago-servicios-linea.net/")).status, "bloqueo");
  assert.equal((await mock.evaluate("https://tienda.pe/")).status, "seguro");
});

test("pendiente.localhost is slower than the pending threshold, triggers onPending and ends safe", async () => {
  assert.ok(Sereno.providers.mock.PENDING_HOST_DELAY_MS > Sereno.verdictOutcome.PENDING_AFTER_MS);
  const pending = [];
  const started = Date.now();
  const outcome = await Sereno.verdictService.evaluate(services(), "http://pendiente.localhost:8080/", {
    pendingAfterMs: 5,
    onPending: (value) => pending.push(value)
  });
  assert.ok(Date.now() - started >= 30);
  assert.deepEqual(pending, [{ kind: "pending", reason: "evaluating" }]);
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.verdict.status, "seguro");
  assert.equal(outcome.verdict.domain, "pendiente.localhost");
});

test("other hosts answer without the pending delay", async () => {
  const pending = [];
  await Sereno.verdictService.evaluate(services(), "http://seguro.localhost/", { pendingAfterMs: 5, onPending: (value) => pending.push(value) });
  assert.deepEqual(pending, []);
});

test("degradado.localhost fails with the normalized server error and ends degraded and non blocking", async () => {
  const result = await newMock().verdict.evaluate("http://degradado.localhost:8080/");
  assert.deepEqual(result, Sereno.providers.errors.failure("server"));
  assert.equal(result.ok, false);
  assert.equal(result.error, "server");

  const outcome = await Sereno.verdictService.evaluate(services(), "http://degradado.localhost:8080/");
  assert.deepEqual(outcome, { kind: "degraded", reason: "server" });
  assert.equal(Sereno.verdictOutcome.blocksNavigation(outcome), false);
});

test("test hosts are recorded in the history of a signed-in user, the degraded one is not", async () => {
  const mock = newMock();
  await mock.auth.login("andres.torres", "sereno123");
  const before = (await mock.data.listHistory()).entries.length;
  await mock.verdict.evaluate("http://bloqueo.localhost:8080/");
  await mock.verdict.evaluate("http://degradado.localhost:8080/");
  const entries = (await mock.data.listHistory()).entries;
  assert.equal(entries.length, before + 1);
  assert.equal(entries[0].domain, "bloqueo.localhost");
});

test("the delay is injectable", async () => {
  const started = Date.now();
  await newMock({ pendingHostDelayMs: 0 }).verdict.evaluate("http://pendiente.localhost/");
  assert.ok(Date.now() - started < 30);
});

/* ---------- service worker path ---------- */

test("handleNavigation on bloqueo.localhost paints the block badge and sends the outcome", async () => {
  const calls = [];
  const records = new Map();
  const browser = {
    async setBadge(tabId, text, color) {
      calls.push({ op: "badge", tabId, text, color });
    },
    async notifyTab(tabId, message) {
      calls.push({ op: "notify", tabId, message });
    },
    async getActiveTabId() {
      return null;
    },
    async loadTabRecord(tabId) {
      return records.has(tabId) ? JSON.parse(JSON.stringify(records.get(tabId))) : null;
    },
    async saveTabRecord(tabId, record) {
      records.set(tabId, JSON.parse(JSON.stringify(record)));
    },
    async removeTabRecord(tabId) {
      records.delete(tabId);
    },
    openPage() {}
  };
  const deps = { services: services(), store: { async set() {} }, browser, now: NOW, options: { pendingAfterMs: 5000 } };

  const outcome = await Sereno.navigationService.handleNavigation(deps, { tabId: 7, url: "http://bloqueo.localhost:8080/" });

  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.verdict.status, "bloqueo");
  assert.deepEqual(calls.filter((call) => call.op === "badge"), [{ op: "badge", tabId: 7, text: "✕", color: "#DC2626" }]);
  assert.deepEqual(calls.filter((call) => call.op === "notify"), [{ op: "notify", tabId: 7, message: { type: "sereno:outcome", outcome } }]);
  assert.equal(Sereno.verdictOutcome.blocksNavigation(outcome), true);
});

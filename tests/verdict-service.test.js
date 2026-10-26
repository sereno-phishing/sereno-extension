"use strict";

/* Verdict use case: one call, one normalized outcome, never throws. Runs over
   both adapters (mock with an injected failure, remote with a fake fetch). */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
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
  "protection/application/protection-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/config.js",
  "platform/providers/ports.js",
  "platform/providers/mock.js",
  "platform/providers/remote.js",
  "platform/providers/index.js",
  "verdict/application/verdict-service.js"
);

const { verdictService, providers } = Sereno;
const NOW = () => new Date(2026, 8, 21, 11, 30, 0);
const BLOCKED_URL = "https://pago-servicios-linea.net/checkout";

function openStore() {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
}

function mockServices() {
  return { verdict: providers.mock.create({ store: openStore(), now: NOW }).verdict };
}

/* Mock adapter whose verdict port fails the way a backend would. */
function failingMock(error) {
  return { verdict: { evaluate: async () => ({ ok: false, error }) } };
}

function remoteServices(fetchImpl, timeoutMs) {
  return { verdict: providers.remote.create({ baseUrl: "https://api.sereno.test", timeoutMs: timeoutMs || 30, fetch: fetchImpl }).verdict };
}

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("the mock adapter yields a verdict outcome", async () => {
  const out = await verdictService.evaluate(mockServices(), BLOCKED_URL);
  assert.equal(out.kind, "verdict");
  assert.equal(out.verdict.status, "bloqueo");
  assert.equal(out.verdict.domain, "pago-servicios-linea.net");
});

test("the remote adapter yields a verdict outcome from the contract body", async () => {
  const services = remoteServices(async () =>
    reply(200, { domain: "a.pe", status: "seguro", score: 0.02, source: "cache", latencyMs: 9 })
  );
  const out = await verdictService.evaluate(services, "https://a.pe/");
  assert.deepEqual(out, { kind: "verdict", verdict: { domain: "a.pe", status: "seguro", score: 0.02, source: "cache", latencyMs: 9 } });
});

["timeout", "offline", "server", "cache_down"].forEach((reason) => {
  test("mock failure " + reason + " degrades without blocking", async () => {
    const out = await verdictService.evaluate(failingMock(reason), BLOCKED_URL);
    assert.deepEqual(out, { kind: "degraded", reason });
    assert.equal(Sereno.verdictOutcome.blocksNavigation(out), false);
  });
});

test("remote network failure degrades as offline", async () => {
  const services = remoteServices(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await verdictService.evaluate(services, "https://a.pe/"), { kind: "degraded", reason: "offline" });
});

test("remote hung request degrades as timeout", async () => {
  const services = remoteServices(
    (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    20
  );
  assert.deepEqual(await verdictService.evaluate(services, "https://a.pe/"), { kind: "degraded", reason: "timeout" });
});

test("remote 500 degrades as server and 503 cache_down as cache_down", async () => {
  assert.deepEqual(await verdictService.evaluate(remoteServices(async () => reply(500, {})), "https://a.pe/"), { kind: "degraded", reason: "server" });
  assert.deepEqual(
    await verdictService.evaluate(remoteServices(async () => reply(503, { error: "cache_down" })), "https://a.pe/"),
    { kind: "degraded", reason: "cache_down" }
  );
});

test("the service enforces its own deadline when a provider never answers", async () => {
  const services = { verdict: { evaluate: () => new Promise(() => {}) } };
  const out = await verdictService.evaluate(services, "https://a.pe/", { timeoutMs: 15 });
  assert.deepEqual(out, { kind: "degraded", reason: "timeout" });
});

test("evaluate never throws, even if the provider rejects or throws", async () => {
  const rejecting = { verdict: { evaluate: async () => { throw new Error("boom"); } } };
  const throwing = { verdict: { evaluate: () => { throw new Error("sync boom"); } } };
  const garbage = { verdict: { evaluate: async () => 42 } };
  for (const services of [rejecting, throwing, garbage, {}, null, undefined]) {
    const out = await verdictService.evaluate(services, "https://a.pe/");
    assert.deepEqual(out, { kind: "degraded", reason: "server" });
  }
  const noUrl = await verdictService.evaluate(mockServices(), undefined);
  assert.ok(["verdict", "degraded"].includes(noUrl.kind));
});

test("onPending fires only when the provider is slower than the threshold", async () => {
  const answer = { ok: true, domain: "a.pe", status: "seguro", score: 0, source: "modelo", latencyMs: 1 };
  const slow = { verdict: { evaluate: () => new Promise((resolve) => setTimeout(() => resolve(answer), 40)) } };
  const seen = [];
  const out = await verdictService.evaluate(slow, "https://a.pe/", { pendingAfterMs: 10, onPending: (o) => seen.push(o) });
  assert.equal(out.kind, "verdict");
  assert.deepEqual(seen, [{ kind: "pending", reason: "evaluating" }]);

  const quick = [];
  await verdictService.evaluate(mockServices(), "https://a.pe/", { pendingAfterMs: 50, onPending: (o) => quick.push(o) });
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.deepEqual(quick, []);
});

test("a throwing onPending callback does not break the evaluation", async () => {
  const slow = { verdict: { evaluate: () => new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "offline" }), 30)) } };
  const out = await verdictService.evaluate(slow, "https://a.pe/", {
    pendingAfterMs: 5,
    onPending: () => {
      throw new Error("ui broke");
    }
  });
  assert.deepEqual(out, { kind: "degraded", reason: "offline" });
});

test("nothing is persisted unless a store is passed", async () => {
  const store = openStore();
  const before = await store.get();
  await verdictService.evaluate(mockServices(), BLOCKED_URL);
  assert.deepEqual(await store.get(), before);
});

test("with a store the outcome is published as currentSite and protection level", async () => {
  const store = openStore();
  await verdictService.evaluate(mockServices(), BLOCKED_URL, { store, now: NOW });
  let state = await store.get();
  assert.equal(state.currentSite.domain, "pago-servicios-linea.net");
  assert.equal(state.currentSite.status, "bloqueo");
  assert.equal(state.currentSite.ts, "2026-09-21T11:30");
  assert.equal(state.protectionLevel, "active");
  await verdictService.evaluate(failingMock("cache_down"), "https://nuevo.pe/", { store, now: NOW });
  state = await store.get();
  assert.equal(state.currentSite.domain, "nuevo.pe");
  assert.equal(state.currentSite.status, "evaluando");
  assert.equal(state.protectionLevel, "degraded");
});

test("a failing store does not make evaluate throw", async () => {
  const brokenStore = { set: async () => { throw new Error("quota"); } };
  const out = await verdictService.evaluate(mockServices(), BLOCKED_URL, { store: brokenStore, now: NOW });
  assert.equal(out.kind, "verdict");
});

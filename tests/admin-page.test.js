"use strict";

/* The admin container loads each section through the administration use
   cases, shows an error state when the backend fails and retries on demand. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load } = require("./load");

const { domainPolicy } = load("administration/domain/domain-policy.js");
const settle = () => new Promise((resolve) => setImmediate(resolve));
const ROWS = [{ domain: "a.pe", policy: "bloqueo", updatedAt: "2026-09-21" }];
const CACHE = { ttlPhishingDays: 7, ttlLegitHours: 24, invalidations: [] };

async function adminHarness(administrationService, session, currentSession, initialHash = "") {
  const renders = [];
  const location = { hash: initialHash };
  let hashchange = () => {};
  let actions;
  let subscriber = () => {};
  let state = { session: session === undefined ? { username: "admin", role: "administrador" } : session };
  let input = { value: "" };
  const root = {
    set innerHTML(_html) { input = { value: "" }; },
    querySelector: (selector) => selector === '[name="newDomain"]' ? input : null
  };
  const Sereno = {
    services: {},
    time: { isoDay: () => "2026-09-22" },
    domainPolicy,
    administrationService,
    accountService: {
      currentSession: currentSession || (async () => ({ ok: true, session: state.session, verified: true }))
    },
    account: { isAdmin: (current) => !!current && current.role === "administrador" },
    stateStore: { open: () => ({
      subscribe: (listener) => { subscriber = listener; },
      ready: () => Promise.resolve(state)
    }) },
    adminViews: {
      page: (model, renderedState) => {
        renders.push({ ...model, renderedSession: renderedState.session, load: JSON.parse(JSON.stringify(model.load)) });
        return "page";
      }
    },
    browser: { openPage: () => {} },
    ui: {
      captureFocus: () => () => {},
      delegateActions: (_root, handlers) => { actions = handlers; },
      onReady: (init) => init()
    }
  };
  const context = vm.createContext({
    Sereno,
    document: { getElementById: () => root },
    window: { location, addEventListener: (type, listener) => { if (type === "hashchange") hashchange = listener; } },
    setTimeout,
    clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/admin/admin-page.js"), "utf8"), context);
  await settle();
  return {
    actions,
    renders,
    location,
    domainInput: () => input,
    navigate(hash) { location.hash = hash; hashchange(); },
    emit(nextSession) {
      state = { session: nextSession };
      subscriber(state);
    }
  };
}

test("fragment routes restore sections and follow browser navigation", async () => {
  for (const section of ["metricas", "dominios", "cache"]) {
    const harness = await adminHarness(service(), undefined, undefined, "#" + section);
    assert.equal(harness.renders.at(-1).section, section);
  }
  const harness = await adminHarness(service(), undefined, undefined, "#dominios");
  harness.actions.nav({ getAttribute: () => "cache" });
  assert.equal(harness.location.hash, "#cache");
  harness.navigate("#cache");
  assert.equal(harness.renders.at(-1).section, "cache");
  harness.navigate("#dominios");
  assert.equal(harness.renders.at(-1).section, "dominios");
  harness.navigate("#main");
  assert.equal(harness.renders.at(-1).section, "dominios");
  harness.navigate("#unknown");
  assert.equal(harness.renders.at(-1).section, "metricas");
  assert.equal((await adminHarness(service())).renders.at(-1).section, "metricas");
});

test("changing the new domain policy keeps the typed domain", async () => {
  const harness = await adminHarness(service(), undefined, undefined, "#dominios");
  harness.domainInput().value = "ejemplo.com";
  harness.actions["pick-add-policy"]({ getAttribute: () => "bloqueo" });
  assert.equal(harness.renders.at(-1).addPolicy, "bloqueo");
  assert.equal(harness.domainInput().value, "ejemplo.com");
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function service(overrides) {
  return {
    loadDomains: async () => ({ ok: true, domains: ROWS }),
    loadCache: async () => ({ ok: true, cache: CACHE }),
    loadMetrics: async () => ({ ok: true, metrics: { analyzed: 1 } }),
    saveDomains: async () => ({ ok: true }),
    addDomain: async () => ({ ok: true, domains: ROWS }),
    saveTtl: async () => ({ ok: true, cache: CACHE }),
    invalidateDomain: async () => ({ ok: true, cache: CACHE }),
    ...overrides
  };
}

test("a cached administrator cannot load or render privileged data before backend verification", async () => {
  const verification = deferred();
  const calls = [];
  const spy = service({
    loadDomains: async () => { calls.push("domains"); return { ok: true, domains: ROWS }; },
    loadCache: async () => { calls.push("cache"); return { ok: true, cache: CACHE }; },
    loadMetrics: async () => { calls.push("metrics"); return { ok: true, metrics: { analyzed: 1 } }; }
  });
  const harness = await adminHarness(spy, { username: "cached", role: "administrador" }, () => verification.promise);
  assert.deepEqual(calls, []);
  assert.equal(harness.renders.at(-1).authorization, "checking");
  verification.resolve({ ok: true, session: { username: "verified", role: "administrador" }, verified: true });
  await settle();
  assert.deepEqual(calls.sort(), ["cache", "domains", "metrics"]);
  assert.equal(harness.renders.at(-1).renderedSession.username, "verified");
});

test("signed-out, demoted or unreachable sessions cannot authorize from a cached administrator", async () => {
  for (const answer of [
    { ok: true, session: null, verified: true },
    { ok: true, session: { username: "cached", role: "usuario" }, verified: true },
    { ok: true, session: { username: "cached", role: "administrador" }, verified: false }
  ]) {
    const calls = [];
    const spy = service({ loadMetrics: async () => { calls.push("metrics"); return { ok: true, metrics: {} }; } });
    const harness = await adminHarness(spy, { username: "cached", role: "administrador" }, async () => answer);
    assert.deepEqual(calls, []);
    assert.equal(harness.renders.at(-1).authorization, "denied");
  }
});

test("an administrator's panel loads every section through the use cases", async () => {
  const { renders } = await adminHarness(service());
  const model = renders.at(-1);
  assert.deepEqual(model.load, { metricas: { status: "ready" }, dominios: { status: "ready" }, cache: { status: "ready" } });
  assert.deepEqual(model.domainsDraft, ROWS);
  assert.deepEqual(model.cache, CACHE);
  assert.deepEqual(model.metrics, { analyzed: 1 });
});

test("nothing is requested before an administrator is signed in", async () => {
  const calls = [];
  const spy = service({ loadMetrics: async () => { calls.push("metrics"); return { ok: true, metrics: {} }; } });
  await adminHarness(spy, null);
  assert.deepEqual(calls, []);
});

test("a failing section shows its message while the others load, and retry reloads it", async () => {
  let fail = true;
  const { actions, renders } = await adminHarness(
    service({
      loadCache: async () => (fail ? { ok: false, error: "offline", message: "Sin conexión." } : { ok: true, cache: CACHE })
    })
  );
  const failed = renders.at(-1);
  assert.deepEqual(failed.load.cache, { status: "error", message: "Sin conexión." });
  assert.equal(failed.load.dominios.status, "ready");
  fail = false;
  actions.retry({ getAttribute: () => "cache" });
  await settle();
  assert.deepEqual(renders.at(-1).load.cache, { status: "ready" });
  assert.deepEqual(renders.at(-1).cache, CACHE);
});

test("a demotion blocks UI policy writes and ignores stale privileged responses", async () => {
  const domains = deferred();
  let writes = 0;
  const harness = await adminHarness(service({
    loadDomains: () => domains.promise,
    saveDomains: async () => { writes += 1; return { ok: true }; }
  }));
  harness.emit({ username: "admin", role: "usuario" });
  await settle();
  harness.actions["save-domains"]();
  domains.resolve({ ok: true, domains: ROWS });
  await settle();
  assert.equal(writes, 0);
  assert.equal(harness.renders.at(-1).authorization, "denied");
  assert.equal(harness.renders.at(-1).domainsDraft.length, 0);
});

test("a failed save keeps the draft and shows the message; a good one clears it", async () => {
  let fail = true;
  const { actions, renders } = await adminHarness(
    service({ saveDomains: async () => (fail ? { ok: false, error: "timeout", message: "Tardó demasiado." } : { ok: true }) })
  );
  actions["save-domains"]();
  await settle();
  assert.equal(renders.at(-1).domainsError, "Tardó demasiado.");
  assert.equal(renders.at(-1).domainsBanner, false);
  fail = false;
  actions["save-domains"]();
  await settle();
  assert.equal(renders.at(-1).domainsError, "");
  assert.equal(renders.at(-1).domainsBanner, true);
});

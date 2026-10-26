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
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ROWS = [{ domain: "a.pe", policy: "bloqueo", updatedAt: "2026-09-21" }];
const CACHE = { ttlPhishingDays: 7, ttlLegitHours: 24, invalidations: [] };

async function adminHarness(administrationService, session) {
  const renders = [];
  let actions;
  const state = { session: session === undefined ? { username: "admin", role: "administrador" } : session };
  const root = { innerHTML: "", querySelector: () => null };
  const Sereno = {
    services: {},
    time: { isoDay: () => "2026-09-22" },
    domainPolicy,
    administrationService,
    account: { isAdmin: (current) => !!current && current.role === "administrador" },
    stateStore: { open: () => ({ subscribe: () => {}, ready: () => Promise.resolve(state) }) },
    adminViews: {
      page: (model) => {
        renders.push({ ...model, load: JSON.parse(JSON.stringify(model.load)) });
        return "page";
      }
    },
    browser: { openPage: () => {} },
    ui: {
      delegateActions: (_root, handlers) => { actions = handlers; },
      onReady: (init) => init()
    }
  };
  const context = vm.createContext({
    Sereno,
    document: { getElementById: () => root },
    setTimeout,
    clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/admin/admin-page.js"), "utf8"), context);
  await settle();
  return { actions, renders };
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

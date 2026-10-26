"use strict";

/* Application use cases against an in-memory state store (the same port the
   pages use), seeded with the prototype's default state. */

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
  "account/application/account-service.js",
  "history/application/history-service.js",
  "survey/application/survey-service.js",
  "administration/application/administration-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js"
);

const NOW = new Date(2026, 8, 21, 11, 30, 0);

function openStore() {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
}

/* History, survey and model version now go through the data port: see
   tests/data-services.test.js. */

test("administration: add domain, save policies, TTL and invalidation", async () => {
  const store = openStore();
  await Sereno.administrationService.addDomain(store, { domain: "nuevo.pe", policy: "bloqueo", updatedAt: "2026-09-21" });
  assert.deepEqual((await store.get()).domains[0], { domain: "nuevo.pe", policy: "bloqueo", updatedAt: "2026-09-21" });
  assert.equal((await store.get()).domains.length, 4);
  await Sereno.administrationService.saveDomains(store, []);
  assert.deepEqual((await store.get()).domains, []);
  await Sereno.administrationService.saveTtl(store, "10", "0");
  assert.equal((await store.get()).cache.ttlPhishingDays, 10);
  assert.equal((await store.get()).cache.ttlLegitHours, 24);
  await Sereno.administrationService.invalidateDomain(store, "ejemplo.pe", NOW);
  assert.deepEqual((await store.get()).cache.invalidations[0], {
    domain: "ejemplo.pe",
    status: "Se reevaluará en la próxima consulta",
    date: "21/09/2026"
  });
});

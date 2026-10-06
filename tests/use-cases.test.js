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

test("login opens a session only for valid credentials", async () => {
  const store = openStore();
  assert.deepEqual(await Sereno.accountService.login(store, "andres.torres", "bad", NOW), { ok: false, error: "invalid" });
  assert.equal((await store.get()).session, null);
  const result = await Sereno.accountService.login(store, "admin.sereno", "sereno123", NOW);
  assert.deepEqual(result, { ok: true, user: { username: "admin.sereno", role: "administrador", createdAt: "2026-09-01T10:00:00" } });
  assert.deepEqual((await store.get()).session, { username: "admin.sereno", role: "administrador", loginAt: "2026-09-21T11:30" });
  await Sereno.accountService.logout(store);
  assert.equal((await store.get()).session, null);
});

test("register refuses duplicates and signs the new user in", async () => {
  const store = openStore();
  assert.deepEqual(await Sereno.accountService.register(store, "andres.torres", "x", NOW), { ok: false, error: "duplicate" });
  assert.deepEqual(await Sereno.accountService.register(store, "nuevo", "abc", NOW), { ok: true });
  const state = await store.get();
  assert.equal(state.users.length, 3);
  assert.deepEqual(state.users[2], { username: "nuevo", password: "abc", role: "usuario", createdAt: "2026-09-21T11:30" });
  assert.equal(state.session.username, "nuevo");
});

test("recordVisit appends for the signed-in user and deduplicates", async () => {
  const store = openStore();
  const visit = { domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo", latencyMs: 186, ts: "2026-09-21T11:30" };
  assert.equal(await Sereno.historyService.recordVisit(store, visit, NOW), undefined);
  await Sereno.accountService.login(store, "andres.torres", "sereno123", NOW);
  await Sereno.historyService.recordVisit(store, visit, NOW);
  await Sereno.historyService.recordVisit(store, visit, NOW);
  const list = (await store.get()).history["andres.torres"];
  assert.equal(list.length, 7);
  assert.equal(list[0].domain, "paypal-secure-login.com");
  assert.match(list[0].id, /^h-/);
  await Sereno.historyService.clear(store, "andres.torres");
  assert.deepEqual((await store.get()).history["andres.torres"], []);
});

test("append stamps visits without a timestamp with the current time", async () => {
  const store = openStore();
  await Sereno.historyService.append(store, "ana", { domain: "a.pe", status: "seguro", score: 0.1 }, NOW);
  assert.equal((await store.get()).history.ana[0].ts, "2026-09-21T11:30");
});

test("survey answers are saved and stamped only on completion", async () => {
  const store = openStore();
  await Sereno.surveyService.saveAnswers(store, [4, null], false, NOW);
  assert.deepEqual((await store.get()).survey, { answers: [4, null], completedAt: null });
  await Sereno.surveyService.saveAnswers(store, [4, 2], true, NOW);
  assert.deepEqual((await store.get()).survey, { answers: [4, 2], completedAt: "2026-09-21T11:30" });
});

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

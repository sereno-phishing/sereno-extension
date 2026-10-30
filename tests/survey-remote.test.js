"use strict";

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
  "survey/application/survey-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/config.js",
  "platform/providers/ports.js",
  "platform/providers/errors.js",
  "platform/providers/mock.js",
  "platform/providers/remote.js",
  "platform/providers/index.js"
);

const ANSWERS = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
const NOW = new Date(2026, 8, 21, 11, 30, 0);

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function openStore(defaults = Sereno.seed.defaultState) {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: "survey-remote-test",
    defaults
  });
}

async function signIn(store, username) {
  await store.set({ session: { username, isAdmin: false, token: "remote-token" } });
}

test("survey is a remote-only status and submit port while verdict and data remain mocked", async () => {
  const store = openStore();
  const calls = [];
  const services = Sereno.providers.create({
    config: { provider: "mock", authProvider: "remote", baseUrl: "https://api.sereno.test", timeoutMs: 50, mockDelayMs: 0 },
    store,
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, credentials: init.credentials, body: init.body && JSON.parse(init.body) });
      return reply(200, init.method === "GET" ? { submitted: false } : {});
    }
  });

  assert.equal((await services.verdict.evaluate("https://tienda-servicios.pe")).status, "seguro");
  assert.equal((await services.data.getMetrics()).metrics.analyzed, 1284);
  assert.equal(typeof services.data.submitSurvey, "undefined");
  assert.equal(typeof Sereno.providers.mock.create({ store }).survey, "undefined");
  assert.deepEqual(Sereno.providers.ports.METHODS.survey, ["status", "submit"]);
  assert.ok(!Sereno.providers.ports.METHODS.data.includes("submitSurvey"));

  assert.deepEqual(await services.survey.status(), { ok: true, submitted: false });
  assert.deepEqual(await services.survey.submit(ANSWERS), { ok: true });
  assert.deepEqual(calls, [
    { url: "https://api.sereno.test/v1/survey", method: "GET", credentials: "include", body: undefined },
    { url: "https://api.sereno.test/v1/survey", method: "POST", credentials: "include", body: { answers: ANSWERS } }
  ]);
});

test("survey status validates the backend response and never trusts a local completion marker", async () => {
  const store = openStore({
    session: { username: "ana", isAdmin: false, token: "remote-token" },
    survey: { byUser: { ana: { answers: ANSWERS, completedAt: "2026-09-20T10:00" } } }
  });
  const services = { survey: { status: async () => ({ ok: true, submitted: false }) } };

  assert.deepEqual(await Sereno.surveyService.status(services), { ok: true, submitted: false });
  assert.equal(Sereno.surveyService.completedAtFor(await store.get(), "ana"), "2026-09-20T10:00");
  assert.deepEqual(await Sereno.surveyService.status({ survey: { status: async () => ({ ok: true, submitted: "no" }) } }), {
    ok: false,
    error: "server",
    message: Sereno.providers.errors.message("server")
  });
});

test("drafts and completion markers are isolated by authenticated username and legacy global survey data is ignored", async () => {
  const store = openStore({
    session: { username: "ana", isAdmin: false, token: "remote-token" },
    survey: { answers: [4, 4, 4], completedAt: "legacy", byUser: {} }
  });
  const services = { survey: { submit: async () => ({ ok: true }) } };

  assert.deepEqual(Sereno.surveyService.draftFor(await store.get(), "ana"), []);
  assert.deepEqual(await Sereno.surveyService.saveDraft(store, "ana", [4, 2]), { ok: true });
  assert.deepEqual(Sereno.surveyService.draftFor(await store.get(), "ana"), [4, 2]);
  assert.deepEqual(Sereno.surveyService.draftFor(await store.get(), "bea"), []);

  await signIn(store, "bea");
  assert.deepEqual(await Sereno.surveyService.saveDraft(store, "bea", [1, 3]), { ok: true });
  assert.deepEqual(await Sereno.surveyService.submit(services, store, "bea", ANSWERS, NOW), { ok: true });

  const state = await store.get();
  assert.deepEqual(state.survey.byUser.ana, { answers: [4, 2], completedAt: null });
  assert.deepEqual(state.survey.byUser.bea, { answers: ANSWERS, completedAt: "2026-09-21T11:30" });
});

test("anonymous users cannot save or submit a survey", async () => {
  const store = openStore();
  let submitted = false;
  const services = { survey: { submit: async () => { submitted = true; return { ok: true }; } } };

  assert.equal((await Sereno.surveyService.saveDraft(store, null, [3])).ok, false);
  assert.equal((await Sereno.surveyService.submit(services, store, null, ANSWERS, NOW)).ok, false);
  assert.equal(submitted, false);
  assert.deepEqual((await store.get()).survey, { byUser: {} });
});

test("a late save or accepted submit cannot write another account's local survey state", async () => {
  const store = openStore();
  await signIn(store, "ana");
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const services = { survey: { submit: () => pending } };

  const submission = Sereno.surveyService.submit(services, store, "ana", ANSWERS, NOW);
  await signIn(store, "bea");
  release({ ok: true });
  assert.deepEqual(await submission, { ok: true });
  assert.deepEqual((await store.get()).survey, { byUser: {} });

  assert.equal((await Sereno.surveyService.saveDraft(store, "ana", [2])).ok, false);
  assert.deepEqual((await store.get()).survey, { byUser: {} });
});

for (const [name, fetchImpl, expected] of [
  ["offline", async () => { throw new TypeError("offline"); }, "offline"],
  ["400", async () => reply(400, { error: "invalid" }), "server"],
  ["401", async () => reply(401, { error: "invalid" }), "server"],
  ["500", async () => reply(500, { error: "server" }), "server"]
]) {
  test("survey " + name + " remains retryable and does not stamp completion", async () => {
    const store = openStore();
    await signIn(store, "ana");
    const remote = Sereno.providers.remote.create({ baseUrl: "https://api.sereno.test", timeoutMs: 30, fetch: fetchImpl });
    const result = await Sereno.surveyService.submit({ survey: remote.survey }, store, "ana", ANSWERS, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.error, expected);
    assert.equal(Sereno.surveyService.completedAtFor(await store.get(), "ana"), null);
  });
}

test("a duplicate submission is preserved as already_submitted and does not create local success", async () => {
  const store = openStore();
  await signIn(store, "ana");
  const remote = Sereno.providers.remote.create({
    baseUrl: "https://api.sereno.test",
    fetch: async () => reply(409, { error: "already_submitted" })
  });

  const result = await Sereno.surveyService.submit({ survey: remote.survey }, store, "ana", ANSWERS, NOW);
  assert.deepEqual(result, {
    ok: false,
    error: "already_submitted",
    message: Sereno.providers.errors.message("already_submitted")
  });
  assert.equal(Sereno.surveyService.completedAtFor(await store.get(), "ana"), null);
});

test("already_submitted is accepted only for survey submission, not unrelated 409 responses", async () => {
  const remote = Sereno.providers.remote.create({
    baseUrl: "https://api.sereno.test",
    fetch: async () => reply(409, { error: "already_submitted" })
  });
  assert.deepEqual(await remote.survey.submit(ANSWERS), { ok: false, error: "already_submitted" });
  assert.deepEqual(await remote.auth.register("ana", "password"), { ok: false, error: "server" });
  assert.deepEqual(await remote.data.getCache(), { ok: false, error: "server" });
});

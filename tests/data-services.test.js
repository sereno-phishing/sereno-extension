"use strict";

/* Use cases that read and write backend-owned data (history, survey, model
   version) go through the data port only. Every case runs against the mock
   adapter and against the remote adapter (a fake fetch serving the REST
   contract on top of a mock), so both behave the same. */

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
  "history/application/history-service.js",
  "survey/application/survey-service.js",
  "protection/application/protection-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/config.js",
  "platform/providers/ports.js",
  "platform/providers/errors.js",
  "platform/providers/mock.js",
  "platform/providers/remote.js",
  "platform/providers/index.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "history/ui/history-views.js",
  "survey/ui/survey-views.js",
  "protection/ui/protection-views.js"
);

const { providers, historyService, surveyService, protectionService } = Sereno;
const NOW = () => new Date(2026, 8, 21, 11, 30, 0);
const BASE_URL = "https://api.sereno.test";

function openStore() {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
}

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/* Serves the REST contract of remote.js by delegating to a mock adapter. */
function fakeBackend(mock) {
  const routes = {
    "POST /v1/verdict": (body) => mock.verdict.evaluate(body.url),
    "POST /v1/auth/login": (body) => mock.auth.login(body.username, body.password),
    "GET /v1/history": () => mock.data.listHistory(),
    "DELETE /v1/history": () => mock.data.deleteHistory(),
    "GET /v1/model": () => mock.data.getModelVersion(),
    "POST /v1/survey": (body) => mock.data.submitSurvey(body.answers)
  };
  return async (url, init) => {
    const key = ((init && init.method) || "GET") + " " + url.slice(BASE_URL.length);
    const route = routes[key];
    if (!route) {
      return reply(404, { error: "server" });
    }
    const out = await route(init && init.body ? JSON.parse(init.body) : undefined);
    return out.ok ? reply(200, out) : reply(401, out);
  };
}

/* { services, store, mock } for each adapter, sharing one state store. */
const SETUPS = {
  mock() {
    const store = openStore();
    const adapter = providers.mock.create({ store, delayMs: 0, now: NOW });
    return { services: { data: adapter.data, verdict: adapter.verdict, auth: adapter.auth }, store, adapter };
  },
  remote() {
    const store = openStore();
    const adapter = providers.mock.create({ store, delayMs: 0, now: NOW });
    const remote = providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 50, fetch: fakeBackend(adapter) });
    return { services: { data: remote.data, verdict: remote.verdict, auth: remote.auth }, store, adapter };
  }
};

function failingServices(fetchImpl) {
  const remote = providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 30, fetch: fetchImpl });
  return { data: remote.data, verdict: remote.verdict, auth: remote.auth };
}

const OFFLINE = async () => {
  throw new TypeError("Failed to fetch");
};
const HUNG = (url, init) =>
  new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });

test("error messages are Spanish and unknown codes read as a server problem", () => {
  const errors = providers.errors;
  assert.equal(errors.normalize("timeout"), "timeout");
  assert.equal(errors.normalize("cache_down"), "cache_down");
  assert.equal(errors.normalize("weird"), "server");
  assert.equal(errors.normalize(undefined), "server");
  assert.match(errors.message("offline"), /Sin conexión/);
  assert.match(errors.message("timeout"), /tardó demasiado/);
  assert.match(errors.message("cache_down"), /caché/);
  assert.match(errors.message("nope"), /servidor no está disponible/);
  assert.deepEqual(errors.failure("timeout"), { ok: false, error: "timeout", message: errors.message("timeout") });
});

test("history.normalize applies the dedupe window and the capacity to an external list", () => {
  const record = (id, domain, ts) => Sereno.history.createRecord({ domain, status: "seguro", score: 0.1 }, id, ts);
  const list = [record("h-2", "a.pe", "2026-09-21T10:01"), record("h-1", "a.pe", "2026-09-21T10:00"), record("h-0", "b.pe", "2026-09-21T09:00")];
  assert.deepEqual(Sereno.history.normalize(list).map((entry) => entry.id), ["h-2", "h-0"]);
  const many = Array.from({ length: 250 }, (_, index) => record("h-" + index, "d" + index + ".pe", "2026-09-01T10:00"));
  const capped = Sereno.history.normalize(many);
  assert.equal(capped.length, Sereno.history.CAPACITY);
  assert.equal(capped[0].id, "h-0");
  assert.equal(Sereno.history.normalize(Sereno.seed.defaultState.history["andres.torres"]).length, 6);
  assert.deepEqual(Sereno.history.normalize(undefined), []);
});

Object.keys(SETUPS).forEach((name) => {
  test(name + ": historyService.list returns nothing when signed out and the user's entries when signed in", async () => {
    const { services } = SETUPS[name]();
    assert.deepEqual(await historyService.list(services), { ok: true, entries: [] });
    await services.auth.login("andres.torres", "sereno123");
    const listed = await historyService.list(services);
    assert.equal(listed.ok, true);
    assert.equal(listed.entries.length, 6);
    assert.equal(listed.entries[0].domain, "pago-servicios-linea.net");
  });

  test(name + ": historyService.clear empties the signed-in user's history", async () => {
    const { services } = SETUPS[name]();
    await services.auth.login("andres.torres", "sereno123");
    assert.deepEqual(await historyService.clear(services), { ok: true });
    assert.deepEqual(await historyService.list(services), { ok: true, entries: [] });
  });

  test(name + ": an evaluated site is recorded in the signed-in user's history, deduplicated", async () => {
    const { services } = SETUPS[name]();
    await services.verdict.evaluate("https://paypal-secure-login.com/");
    assert.deepEqual((await historyService.list(services)).entries, []);
    await services.auth.login("andres.torres", "sereno123");
    await services.verdict.evaluate("https://paypal-secure-login.com/");
    await services.verdict.evaluate("https://paypal-secure-login.com/");
    const entries = (await historyService.list(services)).entries;
    assert.equal(entries.length, 7);
    assert.equal(entries[0].domain, "paypal-secure-login.com");
    assert.equal(entries[0].status, "advertencia");
    assert.match(entries[0].id, /^h-/);
  });

  test(name + ": surveyService.submit sends the answers and stamps completion locally only on success", async () => {
    const { services, store } = SETUPS[name]();
    const answers = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
    assert.deepEqual(await surveyService.submit(services, store, answers, NOW()), { ok: true });
    assert.deepEqual((await store.get()).survey, { answers, completedAt: "2026-09-21T11:30" });
  });

  test(name + ": protectionService.loadModelVersion reads the version from the port", async () => {
    const { services, store } = SETUPS[name]();
    assert.deepEqual(await protectionService.loadModelVersion(services), { ok: true, version: "1.2" });
    await store.set({ session: { username: "andres.torres", role: "usuario", loginAt: "t", token: "x" } });
    assert.deepEqual(await protectionService.loadModelVersion(services), { ok: true, version: "1.3" });
  });
});

test("surveyService.saveDraft stores partial answers without completing the survey", async () => {
  const store = openStore();
  assert.deepEqual(await surveyService.saveDraft(store, [4, null]), { ok: true });
  assert.deepEqual((await store.get()).survey, { answers: [4, null], completedAt: null });
});

test("failures are normalized with a Spanish message and nothing throws", async () => {
  const store = openStore();
  const answers = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
  const cases = [
    ["offline", failingServices(OFFLINE)],
    ["timeout", failingServices(HUNG)],
    ["server", failingServices(async () => reply(500, {}))],
    ["cache_down", failingServices(async () => reply(503, { error: "cache_down" }))]
  ];
  for (const [code, services] of cases) {
    const expected = { ok: false, error: code, message: providers.errors.message(code) };
    assert.deepEqual(await historyService.list(services), expected, "list " + code);
    assert.deepEqual(await historyService.clear(services), expected, "clear " + code);
    assert.deepEqual(await surveyService.submit(services, store, answers, NOW()), expected, "survey " + code);
    assert.deepEqual(await protectionService.loadModelVersion(services), expected, "model " + code);
  }
  assert.equal((await store.get()).survey.completedAt, null);
});

test("a failing survey submission leaves no completion stamp and broken ports do not throw", async () => {
  const store = openStore();
  const throwing = { data: { listHistory: () => { throw new Error("boom"); }, deleteHistory: async () => null, getModelVersion: async () => ({ ok: true }), submitSurvey: async () => ({ ok: true }) } };
  const server = { ok: false, error: "server", message: providers.errors.message("server") };
  assert.deepEqual(await historyService.list(throwing), server);
  assert.deepEqual(await historyService.clear(throwing), server);
  assert.deepEqual(await protectionService.loadModelVersion(throwing), server);
  assert.deepEqual(await historyService.list({}), server);
  assert.deepEqual(await surveyService.submit({}, store, [1], NOW()), server);
  assert.equal((await store.get()).survey.completedAt, null);
});

test("history list shows loading and error states and keeps the happy path markup", () => {
  const { historyUi } = Sereno;
  const entries = [Sereno.history.createRecord({ domain: "a.pe", status: "seguro", score: 0.1 }, "h-1", "2026-09-21T10:00")];
  const happy = historyUi.listView({ tabsHtml: "<tabs>", entries, filter: "todas" });
  assert.match(happy, /history-item/);
  assert.doesNotMatch(happy, /role="alert"/);
  assert.match(historyUi.listView({ tabsHtml: "", entries: [], filter: "todas", loading: true }), /Cargando/);
  assert.doesNotMatch(historyUi.listView({ tabsHtml: "", entries: [], filter: "todas", loading: true }), /Todavía no hay sitios/);
  const failed = historyUi.listView({ tabsHtml: "", entries: [], filter: "todas", error: "Sin conexión. Revisa tu red e inténtalo de nuevo." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Sin conexión/);
  assert.match(failed, /data-action="retry-history"/);
  assert.doesNotMatch(failed, /Todavía no hay sitios/);
  const stale = historyUi.listView({ tabsHtml: "", entries, filter: "todas", error: "x" });
  assert.match(stale, /history-item/);
  assert.match(stale, /role="alert"/);
});

test("survey result shows a retryable error when the submission failed", () => {
  const { surveyUi } = Sereno;
  const result = Sereno.survey.score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
  assert.doesNotMatch(surveyUi.resultView(result), /role="alert"/);
  const failed = surveyUi.resultView(result, { error: "Sin conexión. Revisa tu red e inténtalo de nuevo." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Sin conexión/);
  assert.match(failed, /data-action="survey-retry"/);
  assert.match(failed, /100 \/ 100/);
});

test("the model version comes from the backend and the notice follows it", () => {
  const { protectionUi } = Sereno;
  const state = { session: { username: "a" }, modelNoticeDismissed: false };
  assert.match(protectionUi.modelVersionLabel(state, "1.3"), /Modelo v1\.3/);
  assert.match(protectionUi.modelVersionLabel(state, "1.3"), /is-updated/);
  assert.match(protectionUi.modelVersionLabel({ session: null }, "1.2"), /Modelo v1\.2/);
  assert.doesNotMatch(protectionUi.modelVersionLabel({ session: null }, "1.2"), /is-updated/);
  assert.doesNotMatch(protectionUi.modelVersionLabel(state, null), /Modelo v/);
  assert.match(protectionUi.modelNotice("2.0"), /Modelo actualizado a v2\.0/);
});

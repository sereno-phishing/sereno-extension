"use strict";

/* Use cases reach backend-owned data through ports. History/model/admin use
   data; survey submission uses the remote-only survey port. The remaining data
   cases run against mock and remote adapters to preserve their swap contract. */

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
  "administration/application/administration-service.js",
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
  "ui/molecules.js",
  "verdict/ui/verdict-ui.js",
  "administration/ui/administration-views.js",
  "app/admin/admin-views.js",
  "history/ui/history-views.js",
  "survey/ui/survey-views.js",
  "protection/ui/protection-views.js"
);

const { providers, historyService, surveyService, protectionService, administrationService } = Sereno;
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
    "GET /v1/domains": () => mock.data.getDomainPolicies(),
    "PUT /v1/domains": (body) => mock.data.putDomainPolicies(body.domains),
    "GET /v1/cache": () => mock.data.getCache(),
    "PUT /v1/cache/ttl": (body) => mock.data.setCacheTtl(body.ttlPhishingDays, body.ttlLegitHours),
    "POST /v1/cache/invalidations": (body) => mock.data.invalidateCache(body.domain),
    "GET /v1/metrics": () => mock.data.getMetrics(),
    "GET /v1/model": () => mock.data.getModelVersion(),
    "GET /v1/survey": () => ({ ok: true, submitted: false }),
    "POST /v1/survey": () => ({ ok: true })
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
    const remote = providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 50, fetch: fakeBackend(adapter) });
    return { services: { data: adapter.data, verdict: adapter.verdict, auth: adapter.auth, survey: remote.survey }, store, adapter };
  },
  remote() {
    const store = openStore();
    const adapter = providers.mock.create({ store, delayMs: 0, now: NOW });
    const remote = providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 50, fetch: fakeBackend(adapter) });
    return { services: { data: remote.data, verdict: remote.verdict, auth: remote.auth, survey: remote.survey }, store, adapter };
  }
};

function failingServices(fetchImpl) {
  const remote = providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 30, fetch: fetchImpl });
  return { data: remote.data, verdict: remote.verdict, auth: remote.auth, survey: remote.survey };
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
  assert.match(errors.message("forbidden"), /administrador/);
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

  test(name + ": surveyService.submit sends the answers remotely and stamps only the signed-in account", async () => {
    const { services, store } = SETUPS[name]();
    const answers = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
    await services.auth.login("andres.torres", "sereno123");
    assert.deepEqual(await surveyService.submit(services, store, "andres.torres", answers, NOW()), { ok: true });
    assert.deepEqual((await store.get()).survey, { byUser: { "andres.torres": { answers, completedAt: "2026-09-21T11:30" } } });
  });

  test(name + ": protectionService.loadModelVersion reads the version from the port", async () => {
    const { services, store } = SETUPS[name]();
    assert.deepEqual(await protectionService.loadModelVersion(services), { ok: true, version: "1.3" });
    await store.set({ session: { username: "andres.torres", role: "usuario", loginAt: "t", token: "x" } });
    assert.deepEqual(await protectionService.loadModelVersion(services), { ok: true, version: "1.3" });
  });
});

test("surveyService.saveDraft stores partial answers for the signed-in account without completing the survey", async () => {
  const store = openStore();
  await store.set({ session: { username: "andres.torres", role: "usuario", token: "remote" } });
  assert.deepEqual(await surveyService.saveDraft(store, "andres.torres", [4, null]), { ok: true });
  assert.deepEqual((await store.get()).survey, { byUser: { "andres.torres": { answers: [4, null], completedAt: null } } });
});

test("failures are normalized with a Spanish message and nothing throws", async () => {
  const store = openStore();
  await store.set({ session: { username: "andres.torres", role: "usuario", token: "remote" } });
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
    assert.deepEqual(await surveyService.submit(services, store, "andres.torres", answers, NOW()), expected, "survey " + code);
    assert.deepEqual(await protectionService.loadModelVersion(services), expected, "model " + code);
  }
  assert.equal(surveyService.completedAtFor(await store.get(), "andres.torres"), null);
});

test("a failing survey submission leaves no completion stamp and broken ports do not throw", async () => {
  const store = openStore();
  await store.set({ session: { username: "andres.torres", role: "usuario", token: "remote" } });
  const throwing = {
    data: { listHistory: () => { throw new Error("boom"); }, deleteHistory: async () => null, getModelVersion: async () => ({ ok: true }) },
    survey: { submit: async () => { throw new Error("boom"); } }
  };
  const server = { ok: false, error: "server", message: providers.errors.message("server") };
  assert.deepEqual(await historyService.list(throwing), server);
  assert.deepEqual(await historyService.clear(throwing), server);
  assert.deepEqual(await protectionService.loadModelVersion(throwing), server);
  assert.deepEqual(await historyService.list({}), server);
  assert.deepEqual(await surveyService.submit({}, store, "andres.torres", [1], NOW()), server);
  assert.equal(surveyService.completedAtFor(await store.get(), "andres.torres"), null);
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

test("survey views never expose the SUS score and distinguish pending, accepted, duplicate and retryable failure", () => {
  const { surveyUi } = Sereno;
  const pending = surveyUi.resultView({ state: "submitting" });
  assert.match(pending, /Enviando/);
  assert.doesNotMatch(pending, /Gracias por tu opinión|\/ 100|Excelente|Bueno|Aceptable|A mejorar/);

  const accepted = surveyUi.resultView({ state: "accepted" });
  assert.match(accepted, /Gracias por tu opinión/);
  assert.equal(accepted.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), "Gracias por tu opinión Cerrar");
  assert.match(accepted, /role="status"/);
  assert.doesNotMatch(accepted, /\/ 100|Excelente|Bueno|Aceptable|A mejorar|survey-retry/);

  const duplicate = surveyUi.resultView({ state: "already" });
  assert.equal(duplicate.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), "Gracias por tu opinión Cerrar");
  assert.match(duplicate, /role="status"/);
  assert.match(surveyUi.questionView({ index: 0, selected: null }), /Tus respuestas no incluyen tu usuario/);
  assert.doesNotMatch(duplicate, /survey-retry|\/ 100/);

  const failed = surveyUi.resultView({ state: "error", error: "Sin conexión. Revisa tu red e inténtalo de nuevo." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Sin conexión/);
  assert.match(failed, /data-action="survey-retry"/);
  assert.doesNotMatch(failed, /Gracias por tu opinión|\/ 100/);
});

test("survey status loading and failure do not render questions", () => {
  const loading = Sereno.surveyUi.statusView({ state: "loading" });
  assert.match(loading, /Cargando/);
  assert.match(loading, /role="status"/);
  assert.doesNotMatch(loading, /Pregunta 1|data-action="answer"/);
  const failed = Sereno.surveyUi.statusView({ state: "error", error: "Sin conexión." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /data-action="survey-status-retry"/);
  assert.doesNotMatch(failed, /Pregunta 1|data-action="answer"/);
});

test("the model version comes from the backend and the notice follows it", () => {
  const { protectionUi } = Sereno;
  const state = { session: { username: "a" }, lastSeenModelVersion: "1.2" };
  assert.match(protectionUi.modelVersionLabel(state, "1.3"), /Modelo v1\.3/);
  assert.match(protectionUi.modelVersionLabel(state, "1.3"), /is-updated/);
  assert.match(protectionUi.modelVersionLabel({ session: null }, "1.3"), /Modelo v1\.3/);
  assert.doesNotMatch(protectionUi.modelVersionLabel({ session: null }, "1.3"), /is-updated/);
  assert.doesNotMatch(protectionUi.modelVersionLabel(state, null), /Modelo v/);
  assert.match(protectionUi.modelNotice("2.0"), /Modelo actualizado a v2\.0/);
});

/* ---------------- administration (HU-21, HU-28, HU-29) ---------------- */

Object.keys(SETUPS).forEach((name) => {
  test(name + ": administrationService loads and saves the domain policy", async () => {
    const { services } = SETUPS[name]();
    const loaded = await administrationService.loadDomains(services);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.domains.length, 3);
    assert.deepEqual(Object.keys(loaded.domains[0]).sort(), ["domain", "policy", "updatedAt"]);
    const added = await administrationService.addDomain(services, { domain: "nuevo.pe", policy: "bloqueo", updatedAt: "2026-09-21" });
    assert.equal(added.ok, true);
    assert.deepEqual(added.domains[0], { domain: "nuevo.pe", policy: "bloqueo", updatedAt: "2026-09-21" });
    assert.equal(added.domains.length, 4);
    assert.deepEqual(await administrationService.saveDomains(services, []), { ok: true });
    assert.deepEqual(await administrationService.loadDomains(services), { ok: true, domains: [] });
  });

  test(name + ": administrationService adding a listed domain moves it first without duplicating", async () => {
    const { services } = SETUPS[name]();
    const listed = (await administrationService.loadDomains(services)).domains[2];
    const added = await administrationService.addDomain(services, { domain: listed.domain, policy: "bloqueo", updatedAt: "2026-09-22" });
    assert.equal(added.domains.length, 3);
    assert.deepEqual(added.domains[0], { domain: listed.domain, policy: "bloqueo", updatedAt: "2026-09-22" });
  });

  test(name + ": administrationService manages the verdict cache", async () => {
    const { services } = SETUPS[name]();
    const initial = await administrationService.loadCache(services);
    assert.equal(initial.ok, true);
    assert.equal(initial.cache.ttlPhishingDays, 7);
    const ttl = await administrationService.saveTtl(services, "14", "0");
    assert.equal(ttl.ok, true);
    assert.equal(ttl.cache.ttlPhishingDays, 14);
    assert.equal(ttl.cache.ttlLegitHours, 24);
    const invalidated = await administrationService.invalidateDomain(services, "ejemplo.pe");
    assert.equal(invalidated.ok, true);
    assert.deepEqual(invalidated.cache.invalidations[0], {
      domain: "ejemplo.pe",
      status: "Se reevaluará en la próxima consulta",
      date: "21/09/2026"
    });
    assert.deepEqual((await administrationService.loadCache(services)).cache, invalidated.cache);
  });

  test(name + ": administrationService loads the metrics", async () => {
    const { services } = SETUPS[name]();
    const metrics = await administrationService.loadMetrics(services);
    assert.equal(metrics.ok, true);
    assert.equal(metrics.metrics.analyzed, 1284);
  });
});

test("domain policy authorization failures preserve the administrator-only message", async () => {
  const denied = { data: {
    getDomainPolicies: async () => ({ ok: false, error: "forbidden" }),
    putDomainPolicies: async () => ({ ok: false, error: "forbidden" })
  } };
  const expected = { ok: false, error: "forbidden", message: providers.errors.message("forbidden") };
  assert.deepEqual(await administrationService.loadDomains(denied), expected);
  assert.deepEqual(await administrationService.saveDomains(denied, []), expected);
});

test("administration failures are normalized with a Spanish message and nothing throws", async () => {
  const cases = [
    ["offline", failingServices(OFFLINE)],
    ["timeout", failingServices(HUNG)],
    ["server", failingServices(async () => reply(500, {}))],
    ["cache_down", failingServices(async () => reply(503, { error: "cache_down" }))]
  ];
  for (const [code, services] of cases) {
    const expected = { ok: false, error: code, message: providers.errors.message(code) };
    const row = { domain: "a.pe", policy: "bloqueo", updatedAt: "2026-09-21" };
    assert.deepEqual(await administrationService.loadDomains(services), expected, "domains " + code);
    assert.deepEqual(await administrationService.addDomain(services, row), expected, "add " + code);
    assert.deepEqual(await administrationService.saveDomains(services, [row]), expected, "save " + code);
    assert.deepEqual(await administrationService.loadCache(services), expected, "cache " + code);
    assert.deepEqual(await administrationService.saveTtl(services, "1", "1"), expected, "ttl " + code);
    assert.deepEqual(await administrationService.invalidateDomain(services, "a.pe"), expected, "invalidate " + code);
    assert.deepEqual(await administrationService.loadMetrics(services), expected, "metrics " + code);
  }
});

test("malformed administration answers and broken ports read as a server failure", async () => {
  const server = { ok: false, error: "server", message: providers.errors.message("server") };
  const malformed = {
    data: {
      getDomainPolicies: async () => ({ ok: true, domains: "nope" }),
      putDomainPolicies: async () => null,
      getCache: async () => ({ ok: true, cache: null }),
      setCacheTtl: async () => ({ ok: true }),
      invalidateCache: async () => ({ ok: true, cache: 3 }),
      getMetrics: async () => ({ ok: true, metrics: [] })
    }
  };
  assert.deepEqual(await administrationService.loadDomains(malformed), server);
  assert.deepEqual(await administrationService.addDomain(malformed, { domain: "a.pe", policy: "bloqueo", updatedAt: "x" }), server);
  assert.deepEqual(await administrationService.saveDomains(malformed, []), server);
  assert.deepEqual(await administrationService.loadCache(malformed), server);
  assert.deepEqual(await administrationService.saveTtl(malformed, "1", "1"), server);
  assert.deepEqual(await administrationService.invalidateDomain(malformed, "a.pe"), server);
  assert.deepEqual(await administrationService.loadMetrics(malformed), server);
  assert.deepEqual(await administrationService.loadDomains({}), server);
  assert.deepEqual(await administrationService.loadMetrics({ data: { getMetrics: () => { throw new Error("boom"); } } }), server);
});

const ADMIN_STATE = { session: { username: "admin.sereno", role: "administrador", loginAt: "t", token: "x" } };
const LOADED = {
  metricas: { status: "ready" },
  dominios: { status: "ready" },
  cache: { status: "ready" }
};
function adminModel(extra) {
  return Object.assign(
    {
      section: "dominios",
      metrics: Sereno.seed.metrics,
      cache: { ttlPhishingDays: 7, ttlLegitHours: 24, invalidations: [] },
      domainsDraft: [{ domain: "a.pe", policy: "bloqueo", updatedAt: "2026-09-21" }],
      addPolicy: "advertencia",
      load: LOADED
    },
    extra
  );
}

test("admin view never renders cached administrator content while session verification is pending", () => {
  const html = Sereno.adminViews.page(adminModel({ authorization: "checking" }), ADMIN_STATE);
  assert.match(html, /Verificando la sesión/);
  assert.doesNotMatch(html, /data-action="nav"|data-action="save-domains"/);
});

test("each admin section renders its loading state", () => {
  ["metricas", "dominios", "cache"].forEach((section) => {
    const html = Sereno.adminViews.page(adminModel({ section, load: { [section]: { status: "loading" } } }), ADMIN_STATE);
    assert.match(html, /Cargando/, section);
    assert.match(html, /role="status"/, section);
    assert.doesNotMatch(html, /data-action="(save-domains|save-ttl|add-domain)"/, section);
    assert.match(html, /data-action="nav"/, "the sidebar stays usable");
  });
});

test("each admin section renders its error state with the message and a retry", () => {
  const message = providers.errors.message("offline");
  ["metricas", "dominios", "cache"].forEach((section) => {
    const html = Sereno.adminViews.page(adminModel({ section, load: { [section]: { status: "error", message } } }), ADMIN_STATE);
    assert.match(html, /role="alert"/, section);
    assert.match(html, /Sin conexión/, section);
    assert.match(html, new RegExp('data-action="retry" data-section="' + section + '"'), section);
    assert.doesNotMatch(html, /data-action="(save-domains|save-ttl|add-domain)"/, section);
  });
});

test("empty data shows an empty state while the controls stay", () => {
  const domains = Sereno.adminViews.page(adminModel({ domainsDraft: [] }), ADMIN_STATE);
  assert.match(domains, /Todavía no hay dominios en la lista/);
  assert.match(domains, /data-action="add-domain"/);
  assert.doesNotMatch(domains, /<table/);
  const cache = Sereno.adminViews.page(adminModel({ section: "cache" }), ADMIN_STATE);
  assert.match(cache, /No hay invalidaciones recientes/);
  assert.match(cache, /data-action="save-ttl"/);
  const metrics = Sereno.adminViews.page(adminModel({ section: "metricas", metrics: null }), ADMIN_STATE);
  assert.match(metrics, /Todavía no hay métricas/);
});

test("the loaded sections keep their happy path markup", () => {
  const domains = Sereno.adminViews.page(adminModel(), ADMIN_STATE);
  assert.match(domains, /<table/);
  assert.match(domains, /a\.pe/);
  assert.doesNotMatch(domains, /role="alert"/);
  const withInvalidation = { ttlPhishingDays: 9, ttlLegitHours: 5, invalidations: [{ domain: "x.pe", status: "s", date: "2026-09-18" }] };
  const cache = Sereno.adminViews.page(adminModel({ section: "cache", cache: withInvalidation }), ADMIN_STATE);
  assert.match(cache, /value="9"/);
  assert.match(cache, /x\.pe/);
  assert.match(cache, /simulados para la demostración/);
  const metrics = Sereno.adminViews.page(adminModel({ section: "metricas" }), ADMIN_STATE);
  assert.match(metrics, /1 284/);
  assert.match(metrics, /Datos simulados/);
  assert.match(metrics, /no son métricas personales/);
});

test("a failed save or invalidation shows an error banner above the section", () => {
  const message = providers.errors.message("timeout");
  const domains = Sereno.adminViews.page(adminModel({ domainsError: message }), ADMIN_STATE);
  assert.match(domains, /role="alert"/);
  assert.match(domains, /tardó demasiado/);
  assert.match(domains, /data-action="save-domains"/);
  const cache = Sereno.adminViews.page(adminModel({ section: "cache", cacheError: message }), ADMIN_STATE);
  assert.match(cache, /role="alert"/);
  assert.match(cache, /data-action="save-ttl"/);
});

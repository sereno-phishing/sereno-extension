"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Sereno = load("platform/i18n.js", "ui/atoms.js", "ui/molecules.js", "account/domain/account.js", "time/domain/time.js", "verdict/domain/verdict.js", "verdict/ui/verdict-ui.js", "administration/domain/domain-policy.js", "administration/ui/administration-views.js", "app/admin/admin-views.js");

test("admin access gate follows the active language", () => {
  Sereno.i18n.use("en");
  const html = Sereno.adminViews.page({ authorization: "denied" }, { session: null });
  assert.match(html, /Administration panel/);
  Sereno.i18n.use("es");
  assert.match(Sereno.adminViews.page({ authorization: "denied" }, { session: null }), /Panel de administración/);
});

test("English admin sections translate labels while preserving domain and policy identifiers", () => {
  Sereno.i18n.use("en");
  const html = Sereno.administrationUi.domainsSection({ rows: [{ domain: "shop.example", policy: "bloqueo", updatedAt: "2026-10-01" }], addPolicy: "advertencia" });
  assert.match(html, /Domain policy/);
  assert.match(html, /aria-label="Remove shop.example"/);
  assert.match(html, /data-policy="bloqueo"/);
  assert.match(html, /shop.example/);
  assert.match(Sereno.administrationUi.statusSection({ id: "cache", title: "Cache", state: "loading" }), /Loading/);
  assert.match(Sereno.administrationUi.statusSection({ id: "cache", title: "Cache", state: "error", message: "failure" }), /Retry/);
  const pending = Sereno.adminViews.page({ authorization: "authorized", section: "cache", load: { cache: { status: "error", message: "Sin conexión. Revisa tu red e inténtalo de nuevo." } }, loadErrors: { cache: "offline" } }, { session: { isAdmin: true, username: "admin" } });
  assert.match(pending, /Offline\. Check your network/);
  assert.match(pending, /aria-label="Sections"/);
});

test("admin sidebar translates the role label from the isAdmin flag", () => {
  const model = { authorization: "authorized", section: "cache", load: {} };
  Sereno.i18n.use("en");
  assert.match(Sereno.adminViews.page(model, { session: { username: "admin", isAdmin: true } }), /<div class="sidebar-role">Administrator<\/div>/);
  Sereno.i18n.use("es");
  assert.match(Sereno.adminViews.page(model, { session: { username: "admin", isAdmin: true } }), /<div class="sidebar-role">Administrador<\/div>/);
});

test("admin observes stored language and rerenders with document language", async () => {
  let changed;
  let renders = 0;
  const document = { documentElement: {}, getElementById: () => ({ set innerHTML(value) { renders++; }, querySelector: () => null }) };
  const language = { get: () => "en", ready: async () => "en", subscribe: (fn) => { changed = fn; } };
  const S = {
    time: {}, domainPolicy: { DEFAULT_POLICY: "advertencia" }, administrationService: {}, services: {},
    storage: { detect: () => ({}) }, i18n: { create: () => language, use: () => {}, register: () => {}, t: (key) => key },
    stateStore: { open: () => ({ subscribe: () => {}, ready: async () => ({ session: null }) }) },
    accountService: { currentSession: async () => ({ ok: true, verified: true, session: null }) },
    account: { isAdmin: () => false }, adminViews: { page: () => "page", loadingPage: () => "loading" },
    ui: { esc: (value) => value, captureFocus: () => () => {}, delegateActions: () => {}, onReady: (fn) => fn() }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/admin/admin-page.js"), "utf8"), { Sereno: S, document, navigator: { language: "en-US" }, window: { location: { hash: "" }, addEventListener: () => {} }, setTimeout, clearTimeout });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(document.documentElement.lang, "en");
  const before = renders;
  changed("es");
  assert.equal(document.documentElement.lang, "es");
  assert.ok(renders > before);
});

test("metrics and cache translate owned labels, verdicts, errors and notices, not backend values", () => {
  Sereno.i18n.use("en");
  const metrics = Sereno.administrationUi.metricsSection({ metrics: {
    analyzed: 42, deltaPct: 1, phishingPct: 2, phishingCount: 3, latencyMs: 4, latencyTargetMs: 5, cacheHitPct: 6,
    hourly: [], queries: [{ domain: "ejemplo.pe", stamp: "backend-date", source: "backend-source", latencyMs: 7, status: "bloqueo" }]
  } });
  assert.match(metrics, /URLs analyzed/);
  assert.match(metrics, /aria-label="Bar chart of hourly queries/);
  assert.match(metrics, /Blocked/);
  assert.match(metrics, /ejemplo\.pe/);
  assert.match(metrics, /backend-source/);
  assert.match(metrics, /backend-date/);
  const cache = Sereno.administrationUi.cacheSection({ cache: { ttlPhishingDays: 7, ttlLegitHours: 24, invalidations: [{ domain: "ejemplo.pe", status: "backend-status", date: "2026-10-01" }] }, notice: { domain: "ejemplo.pe" }, error: "Sin conexión. Revisa tu red e inténtalo de nuevo.", errorCode: "offline" });
  assert.match(cache, /Verdict cache/);
  assert.match(cache, /Domain to invalidate/);
  assert.match(cache, /ejemplo\.pe was invalidated/);
  assert.match(cache, /Offline\. Check your network/);
  assert.match(cache, /backend-status/);
  assert.match(cache, /Actions/);
  assert.equal(Sereno.administrationUi.errorMessage("unknown", "backend message"), "backend message");
  assert.equal(Sereno.administrationUi.errorMessage("offline", "backend message"), "backend message");
  Sereno.i18n.use("es");
  assert.match(Sereno.administrationUi.cacheSection({ cache: {}, notice: "TTL guardado." }), /TTL guardado/);
});

test("views fall back to Spanish without i18n", () => {
  const context = vm.createContext({ Sereno: {} });
  for (const file of ["ui/atoms.js", "ui/molecules.js", "account/domain/account.js", "time/domain/time.js", "verdict/domain/verdict.js", "verdict/ui/verdict-ui.js", "administration/domain/domain-policy.js", "administration/ui/administration-views.js", "app/admin/admin-views.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  assert.match(context.Sereno.adminViews.page({ authorization: "denied" }, { session: null }), /Panel de administración/);
  assert.match(context.Sereno.administrationUi.domainsSection({ rows: [], addPolicy: "advertencia" }), /Política por dominio/);
});

test("real preference initializes from storage, then responds to external changes", async () => {
  let watch;
  const storage = { get: async () => "en", watch: (_key, fn) => { watch = fn; } };
  const updates = [];
  const language = Sereno.i18n.create(storage, "es-PE");
  language.subscribe((value) => updates.push(value));
  assert.equal(await language.ready(), "en");
  watch("es");
  assert.deepEqual(updates, ["en", "es"]);
});

test("admin sidebar avatar shows the initials of the signed-in account", () => {
  const model = { authorization: "authorized", section: "cache", load: {} };
  const html = Sereno.adminViews.page(model, { session: { username: "andres.torres", isAdmin: true } });
  assert.match(html, /<span class="avatar" aria-hidden="true">AT<\/span>/);
});

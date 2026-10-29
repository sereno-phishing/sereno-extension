"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../platform/i18n.js");
const i18n = globalThis.Sereno.i18n;

test("language preference wins over browser language; unsupported languages fall back to Spanish", () => {
  assert.equal(i18n.resolveLanguage("en", "es-PE"), "en");
  assert.equal(i18n.resolveLanguage(null, "en-US"), "en");
  assert.equal(i18n.resolveLanguage(null, "fr-FR"), "es");
});

test("active language translates registered UI messages without changing data", () => {
  i18n.register({ "test.status": { es: "Activo", en: "Active" } });
  i18n.use("en");
  assert.equal(i18n.t("test.status"), "Active");
  assert.equal(i18n.t("tienda.pe"), "tienda.pe");
  i18n.use("es");
  assert.equal(i18n.t("test.status"), "Activo");
});

test("catalog supports surface-specific translations without changing data", () => {
  i18n.register({ "test.example": { es: "Sitio", en: "Site" } });
  assert.equal(i18n.message("test.example", "en"), "Site");
  assert.equal(i18n.message("tienda.pe", "en"), "tienda.pe");
});

test("registered catalogs merge, use safe own keys, and fall back to Spanish", () => {
  i18n.register({ "test.partial": { es: "Solo español" } });
  i18n.register({ "test.other": { es: "Otro", en: "Other" } });
  assert.equal(i18n.message("test.partial", "en"), "Solo español");
  assert.equal(i18n.message("test.other", "en"), "Other");
  assert.equal(i18n.message("constructor", "en"), "constructor");
});

test("a storage notification during initialization cannot be overwritten by a stale read", async () => {
  let release;
  let watcher;
  const storage = {
    get: () => new Promise((resolve) => { release = resolve; }),
    set: async () => {},
    watch: (key, callback) => { watcher = callback; }
  };
  const language = i18n.create(storage, "es-PE");
  const ready = language.ready();
  watcher("en");
  release("es");
  assert.equal(await ready, "en");
  assert.equal(language.get(), "en");
});

test("invalid selections are rejected and unsubscribed listeners stop receiving updates", async () => {
  let watcher;
  const storage = { get: async () => undefined, set: async () => {}, watch: (key, callback) => { watcher = callback; } };
  const language = i18n.create(storage, "en-US");
  let calls = 0;
  const unsubscribe = language.subscribe(() => { calls += 1; });
  await assert.rejects(language.set("fr"), /Unsupported language/);
  watcher("es");
  unsubscribe();
  watcher("en");
  assert.equal(calls, 1);
});

test("catalog resolves Spanish and English messages and keeps unknown identifiers intact", () => {
  assert.equal(i18n.message("language.label", "es"), "Idioma");
  assert.equal(i18n.message("language.label", "en"), "Language");
  assert.equal(i18n.message("unknown.identifier", "en"), "unknown.identifier");
});

test("preference is persisted and observed across extension surfaces", async () => {
  let value;
  let watcher;
  const storage = {
    get: async () => value,
    set: async (key, next) => { value = next; },
    watch: (key, callback) => { watcher = callback; }
  };
  const language = i18n.create(storage, "en-US");
  assert.equal(await language.ready(), "en");
  await language.set("es");
  assert.equal(value, "es");
  let observed;
  language.subscribe((next) => { observed = next; });
  watcher("en");
  assert.equal(observed, "en");
  assert.equal(language.get(), "en");
});

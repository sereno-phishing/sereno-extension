"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("boot copy follows browser and saved language without replacing focused UI", async () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "app/popup/popup.html"), "utf8");
  assert.match(html, /<script src="popup-boot-i18n\.js"><\/script>/);
  const i18n = fs.readFileSync(path.join(root, "platform/i18n.js"), "utf8");
  const boot = fs.readFileSync(path.join(root, "app/popup/popup-boot-i18n.js"), "utf8");
  let resolvePreference;
  const label = { textContent: "Cargando Sereno..." };
  const skeleton = { lang: "es", querySelector: () => label };
  const focused = {};
  let present = true;
  const document = { activeElement: focused, querySelector: () => present ? skeleton : null };
  const context = vm.createContext({ document, navigator: { language: "en-US" }, Sereno: {
    storage: { detect: () => ({ get: () => new Promise((resolve) => { resolvePreference = resolve; }), watch: () => {} }) }
  } });
  vm.runInContext(i18n, context);
  vm.runInContext(boot, context);
  assert.equal(label.textContent, "Loading Sereno...");
  assert.equal(skeleton.lang, "en");
  resolvePreference("es");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(label.textContent, "Cargando Sereno...");
  assert.equal(skeleton.lang, "es");
  assert.equal(document.activeElement, focused);
  label.textContent = "Loading Sereno...";
  const fallback = vm.createContext({ document, Sereno: {} });
  vm.runInContext(boot, fallback);
  assert.equal(label.textContent, "Cargando Sereno...");
  assert.equal(skeleton.lang, "es");
  present = false;
  label.textContent = "already rendered";
  vm.runInContext(boot, fallback);
  assert.equal(label.textContent, "already rendered");
});

test("account forms follow the selected language and fall back to Spanish", () => {
  const app = load("platform/i18n.js", "ui/atoms.js", "ui/molecules.js", "account/domain/account.js", "account/ui/account-views.js");
  app.i18n.use("en");
  assert.match(app.accountUi.loginView({ error: false }), /Sign in/);
  assert.match(app.accountUi.loginView({ error: true, errorCode: "offline" }), /Offline\. Check your connection/);
  assert.match(app.accountUi.registerView({ error: true, errorCode: "duplicate" }), /Choose another username/);
  const menu = app.accountUi.accountMenu({ username: "<example>", isAdmin: false });
  assert.match(menu, /&lt;example&gt;/);
  assert.match(menu, /Role: User/);
  assert.match(app.accountUi.accountMenu({ username: "a", isAdmin: true }), /Role: Administrator/);
  assert.match(menu, /Sign out/);
  app.i18n.use("es");
  assert.match(app.accountUi.loginView({ error: false }), /Inicia sesión/);
  assert.match(app.accountUi.accountMenu({ username: "a", isAdmin: true }), /Rol: Administrador/);
  assert.match(app.accountUi.accountMenu({ username: "a", isAdmin: false }), /Rol: Usuario/);
});

test("onboarding, protection and history localize without changing backend values", () => {
  const app = load("time/domain/time.js", "verdict/domain/verdict.js", "verdict/domain/outcome.js", "history/domain/history.js", "onboarding/domain/onboarding.js", "protection/domain/protection.js", "verdict/ui/verdict-ui.js", "app/popup/popup-i18n.js", "onboarding/ui/onboarding-view.js", "history/ui/history-views.js", "protection/ui/protection-views.js");
  app.i18n.use("en");
  assert.match(app.onboardingUi.view(1), /We check the site/);
  assert.match(app.onboardingUi.stepCounter(2), /Step/);
  assert.match(app.protectionUi.siteCard({ domain: "example.es", status: "seguro" }, "active"), /example\.es/);
  assert.match(app.protectionUi.siteCard({ domain: "example.es", status: "seguro" }, "active"), /Safe/);
  assert.match(app.historyUi.listView({ tabsHtml: "", entries: [], filter: app.history.ALL }), /No sites/);
  const detail = app.historyUi.detailView({ domain: "example.es", status: "seguro", score: 0.1, source: "cache", ts: "2026-01-01T00:00:00Z" });
  assert.match(detail, /example\.es/);
  assert.match(detail, /Risk level/);
  assert.match(app.protectionUi.protectionCard("degraded", "offline"), /Offline/);
  assert.match(app.historyUi.clearConfirm(), /Clear your history/);
  assert.match(app.onboardingUi.view(3), /How to read an alert/);
  load("platform/providers/errors.js");
  const list = (error, errorCode) => app.historyUi.listView({ tabsHtml: "", entries: [], filter: app.history.ALL, error, errorCode });
  assert.match(list(app.providers.errors.message("offline"), "offline"), /Offline\. Check your connection/);
  assert.match(list("Error del backend", "offline"), /Error del backend/);
  assert.match(list("Error del backend", null), /Error del backend/);
  app.i18n.use("es");
  assert.match(app.onboardingUi.view(1), /Revisamos el sitio/);
});

test("popup localizes the surrounding UI and the SUS survey", () => {
  const app = load("survey/domain/sus.js", "survey/ui/survey-views.js", "app/popup/popup-views.js");
  app.i18n.use("en");
  const state = { session: null, currentSite: { domain: "example.es", status: "seguro" } };
  const home = app.popupViews.page({ view: "home", language: "en" }, state);
  assert.match(home, /Privacy policy/);
  assert.match(home, /This site/);
  assert.match(home, /example\.es/);
  const survey = app.popupViews.page({ view: "survey", language: "en", surveyIndex: 0, surveyAnswers: [] }, state);
  assert.doesNotMatch(survey, /<main[^>]*lang=/);
  assert.match(survey, /Strongly disagree/);
  assert.match(survey, /Privacy policy/);
});

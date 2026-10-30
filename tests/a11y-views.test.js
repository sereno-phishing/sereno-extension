"use strict";

/* Accessibility baseline of the generated HTML (string level). Nothing here
   runs a browser or a screen reader: it checks roles, names, labels, landmarks
   and ARIA references in what the views return. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const Sereno = load(
  "ui/atoms.js", "ui/molecules.js", "ui/dom.js",
  "platform/seed.js",
  "time/domain/time.js", "verdict/domain/verdict.js", "verdict/domain/outcome.js",
  "account/domain/account.js", "history/domain/history.js", "survey/domain/sus.js",
  "onboarding/domain/onboarding.js", "protection/domain/protection.js",
  "administration/domain/domain-policy.js", "administration/domain/verdict-cache.js",
  "verdict/ui/verdict-ui.js", "onboarding/ui/onboarding-view.js", "account/ui/account-views.js",
  "history/ui/history-views.js", "survey/ui/survey-views.js", "protection/ui/protection-views.js",
  "administration/ui/administration-views.js", "app/popup/popup-views.js", "app/admin/admin-views.js"
);

const { ui, popupViews, adminViews, onboardingUi, accountUi, historyUi, surveyUi } = Sereno;
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

/* ---------------- scanners ---------------- */

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function ids(html) {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
}

function visibleText(inner) {
  return inner
    .replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<img[^>]*alt="([^"]+)"[^>]*>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function problems(html) {
  const found = [];
  const all = ids(html);
  new Set(all.filter((id, index) => all.indexOf(id) !== index)).forEach((id) => found.push(`duplicate id ${id}`));
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    if (attr(match[0], "alt") === null) found.push(`img without alt: ${match[0]}`);
  }
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const open = `<button${match[1]}>`;
    if (!attr(open, "aria-label") && !visibleText(match[2])) found.push(`button without a name: ${open}`);
  }
  const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
  for (const match of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = match[0];
    const named = attr(tag, "aria-label") || attr(tag, "aria-labelledby") ||
      labels.some((label) => label[0].includes(tag) || (attr(tag, "id") && attr(`<label${label[1]}>`, "for") === attr(tag, "id")));
    if (!named) found.push(`input without a label: ${tag}`);
  }
  for (const match of html.matchAll(/\s(?:aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) {
      if (!all.includes(id)) found.push(`dangling reference ${id}`);
    }
  }
  for (const match of html.matchAll(/<th\b[^>]*>/g)) {
    if (attr(match[0], "scope") !== "col") found.push(`th without scope: ${match[0]}`);
  }
  for (const match of html.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
    if (!/<caption\b/.test(match[0])) found.push("table without caption");
  }
  return found;
}

const count = (html, pattern) => (html.match(pattern) || []).length;

/* ---------------- sample data ---------------- */

const USER = { username: "ana", isAdmin: false };
const ADMIN = { username: "admin", isAdmin: true };
const ENTRIES = Sereno.seed.defaultState.history["andres.torres"];
const BASE = { historyFilter: Sereno.history.ALL, onboardingStep: 1, surveyIndex: 0, surveyAnswers: [3], historyEntries: ENTRIES, detailId: "h-000001" };

function popupCases() {
  const cases = [];
  const add = (name, model, session) => cases.push([name, popupViews.page({ ...BASE, ...model }, { session, currentSite: { domain: "tienda.pe", status: "seguro" } })]);
  add("home signed out", { view: "home" }, null);
  add("home user", { view: "home" }, USER);
  add("home admin", { view: "home" }, ADMIN);
  add("home offline notice", { view: "home", sessionOffline: true }, USER);
  add("history", { view: "history" }, USER);
  add("history loading", { view: "history", historyEntries: [], historyLoading: true }, USER);
  add("history error", { view: "history", historyError: "No se pudo cargar." }, USER);
  add("history empty", { view: "history", historyEntries: [] }, USER);
  add("detail", { view: "detail" }, USER);
  add("survey status loading", { view: "surveyStatus", surveyStatus: "loading" }, USER);
  add("survey status error", { view: "surveyStatus", surveyStatus: "error", surveyStatusError: "No se pudo consultar." }, USER);
  add("survey", { view: "survey" }, USER);
  add("survey result sending", { view: "surveyResult", surveySubmission: "submitting" }, USER);
  add("survey result accepted", { view: "surveyResult", surveySubmission: "accepted" }, USER);
  add("survey result duplicate", { view: "surveyResult", surveySubmission: "already" }, USER);
  add("survey result error", { view: "surveyResult", surveySubmission: "error", surveyError: "No se pudo enviar." }, USER);
  add("login", { view: "login" }, null);
  add("login error", { view: "login", loginError: true, loginErrorCode: "invalid", draftUsername: "x", draftPassword: "y" }, null);
  add("register", { view: "register" }, null);
  add("register taken", { view: "register", registerError: true, draftUsername: "x" }, null);
  add("register offline", { view: "register", registerError: true, registerErrorCode: "offline" }, null);
  [1, 2, 3].forEach((step) => add(`onboarding ${step}`, { view: "onboarding", onboardingStep: step }, null));
  add("menu open", { view: "home", menuOpen: true }, USER);
  add("confirm open", { view: "history", confirmOpen: true }, USER);
  return cases;
}

/* ---------------- atoms and fields ---------------- */

test("the input atom takes an id, an accessible name, validity and a description", () => {
  const html = ui.input({
    cls: "input", type: "text", name: "newDomain", id: "new-domain", ariaLabel: "Dominio a agregar",
    invalid: true, describedBy: "help-1", autocomplete: "off", assist: true
  });
  assert.match(html, /id="new-domain"/);
  assert.match(html, /aria-label="Dominio a agregar"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="help-1"/);
  assert.equal((html.match(/autocomplete=/g) || []).length, 1);
  assert.doesNotMatch(ui.input({ cls: "input", type: "text", name: "x" }), /aria-invalid|aria-describedby|id=/);
});

test("the field molecule names its input from its label, links the help text and marks errors", () => {
  const html = ui.field({ label: "Usuario", name: "username", type: "text", autocomplete: "username", hasError: true, help: "Elige otro.", helpIsError: true });
  assert.deepEqual(problems(html), []);
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /aria-invalid="true"/);
  const helpId = html.match(/aria-describedby="([^"]+)"/)[1];
  assert.match(html, new RegExp(`id="${helpId}"`));
  assert.doesNotMatch(ui.field({ label: "Usuario", name: "username", type: "text" }), /aria-invalid|aria-describedby/);
});

test("login and register declare autocomplete tokens and tie errors to their fields", () => {
  const login = accountUi.loginView({ error: true, errorCode: "invalid", username: "x", password: "y" });
  assert.match(login, /name="username"[^>]*autocomplete="username"/);
  assert.match(login, /name="password"[^>]*autocomplete="current-password"/);
  assert.match(login, /<div class="banner-error" role="alert" id="form-error">/);
  assert.equal(count(login, /aria-describedby="form-error"/g), 2);
  assert.equal(count(login, /aria-invalid="true"/g), 2);
  const register = accountUi.registerView({ error: true, draftUsername: "x" });
  assert.match(register, /name="password"[^>]*autocomplete="new-password"/);
  assert.match(register, /name="username"[^>]*aria-invalid="true"/);
  const quiet = accountUi.loginView({ error: false });
  assert.doesNotMatch(quiet, /aria-invalid|form-error/);
});

test("the chip atom can carry an accessible name that extends its visible label", () => {
  const html = ui.chip({ cls: "c", action: "a", pressed: true, label: "Bloqueo", ariaLabel: "Bloqueo para a.pe" });
  assert.match(html, /aria-label="Bloqueo para a\.pe" aria-pressed="true"/);
});

/* ---------------- popup ---------------- */

test("every popup view passes the structural scan and has exactly one h1", () => {
  for (const [name, html] of popupCases()) {
    assert.deepEqual(problems(html), [], name);
    assert.equal(count(html, /<h1\b/g), 1, `${name}: one h1`);
    assert.equal(count(html, /<main\b/g), 1, `${name}: one main`);
    assert.equal(count(html, /<header class="app-header"/g), 1, name);
  }
});

test("the popup tabs are a labelled tablist with roving tabindex and linked panels", () => {
  for (const [view, other] of [["home", "history"], ["history", "home"]]) {
    const html = popupViews.page({ ...BASE, view }, { session: USER, currentSite: {} });
    assert.match(html, /role="tablist" aria-label="Secciones"/);
    const active = html.match(new RegExp(`<button[^>]*data-tab="${view}"[^>]*>`))[0];
    const inactive = html.match(new RegExp(`<button[^>]*data-tab="${other}"[^>]*>`))[0];
    assert.equal(attr(active, "tabindex"), "0");
    assert.equal(attr(inactive, "tabindex"), "-1");
    assert.equal(attr(active, "id"), `tab-${view}`);
    assert.equal(attr(active, "aria-controls"), `tabpanel-${view}`);
    assert.match(html, new RegExp(`<div class="tab-panel" role="tabpanel" id="tabpanel-${view}" aria-labelledby="tab-${view}">`));
    assert.equal(count(html, /role="tabpanel"/g), 1);
  }
});

test("the account menu is not a tab target and the avatar button has a name", () => {
  const html = popupViews.page({ ...BASE, view: "home", menuOpen: true, surveyMenuStatus: "available" }, { session: USER, currentSite: {} });
  assert.match(html, /aria-label="Cuenta de ana"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="menu" aria-label="Cuenta"/);
  assert.match(html, /data-action="open-survey"[^>]*>Encuesta de opinión/);

  for (const status of ["loading", "submitted"]) {
    const hidden = popupViews.page({ ...BASE, view: "home", menuOpen: true, surveyMenuStatus: status }, { session: USER, currentSite: {} });
    assert.doesNotMatch(hidden, /open-survey|Encuesta de opinión/, status);
    assert.match(hidden, /data-action="logout"[^>]*>Cerrar sesión/);
    assert.deepEqual(problems(hidden), [], status);
  }
  const recoverable = popupViews.page({ ...BASE, view: "home", menuOpen: true, surveyMenuStatus: "error" }, { session: USER, currentSite: {} });
  assert.match(recoverable, /data-action="open-survey"[^>]*>Encuesta de opinión/);
});

test("the clear-history confirmation is a labelled modal dialog and the page behind it is inert", () => {
  const html = popupViews.page({ ...BASE, view: "history", confirmOpen: true }, { session: USER, currentSite: {} });
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text"/);
  assert.match(html, /<h2 class="confirm-title" id="confirm-title">/);
  assert.match(html, /<main[^>]* inert/);
  assert.doesNotMatch(popupViews.page({ ...BASE, view: "history" }, { session: USER, currentSite: {} }), /inert/);
});

test("decorative glyphs and chevrons are hidden from assistive technology", () => {
  const list = popupViews.page({ ...BASE, view: "history" }, { session: USER, currentSite: {} });
  assert.match(list, /<span class="chevron" aria-hidden="true">/);
  assert.match(Sereno.verdictUi.badge("pendiente", "14"), /<span class="art-glyph art-14" aria-hidden="true">/);
  for (const step of [1, 2, 3]) {
    assert.match(onboardingUi.view(step), /<div class="illustration" aria-hidden="true">/);
  }
  assert.match(onboardingUi.view(1), /<span class="dots" aria-hidden="true">|<div class="dots" aria-hidden="true">/);
  assert.match(onboardingUi.stepCounter(2), /<span class="sr-only">Paso <\/span>2 de 3/);
});

test("the survey exposes its progress, its scale group and a single h1", () => {
  const html = surveyUi.questionView({ index: 2, selected: 4 });
  assert.match(html, /role="progressbar" aria-label="Progreso de la encuesta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30"/);
  assert.match(html, /<h1 class="survey-question">/);
  assert.match(html, /role="group" aria-label="[^"]*1[^"]*5[^"]*"/);
});

test("banners that report failures are alerts and progress or loading states are status regions", () => {
  assert.match(historyUi.listView({ tabsHtml: "", entries: [], filter: "todas", error: "x" }), /role="alert"/);
  assert.match(historyUi.listView({ tabsHtml: "", entries: [], filter: "todas", loading: true }), /role="status"/);
  assert.match(surveyUi.statusView({ state: "loading" }), /role="status"/);
  assert.match(surveyUi.statusView({ state: "error", error: "x" }), /role="alert"/);
  assert.match(surveyUi.resultView({ state: "submitting" }), /role="status"/);
  assert.match(surveyUi.resultView({ state: "error", error: "x" }), /role="alert"/);
});

test("the score bar in the detail is decorative and its value is read as text", () => {
  const html = popupViews.page({ ...BASE, view: "detail" }, { session: USER, currentSite: {} });
  assert.match(html, /<span class="score-track" aria-hidden="true">/);
});

/* ---------------- admin ---------------- */

function adminHtml(section, extra) {
  const model = { section, metrics: Sereno.seed.metrics, domainsDraft: Sereno.seed.defaultState.domains, addPolicy: "advertencia",
    cache: Sereno.seed.defaultState.cache, load: {}, ...extra };
  return adminViews.page(model, { session: ADMIN });
}

test("the three admin sections pass the structural scan and have one h1 and one main", () => {
  for (const section of ["metricas", "dominios", "cache"]) {
    const html = adminHtml(section);
    assert.deepEqual(problems(html), [], section);
    assert.equal(count(html, /<h1\b/g), 1, `${section}: one h1`);
    assert.equal(count(html, /<main\b/g), 1, section);
  }
  const loading = adminHtml("cache", { load: { cache: { status: "loading" } } });
  const failed = adminHtml("cache", { load: { cache: { status: "error", message: "Falló." } } });
  assert.deepEqual(problems(loading), []);
  assert.deepEqual(problems(failed), []);
  assert.deepEqual(problems(adminViews.page({}, { session: null })), []);
});

test("the admin panel starts with a skip link to a focusable main region", () => {
  const html = adminHtml("metricas");
  assert.ok(html.startsWith('<a class="skip-link" href="#main">Saltar al contenido</a>'));
  assert.match(html, /<main class="options-content" id="main" tabindex="-1">/);
  assert.match(html, /<nav class="sidebar-nav" aria-label="Secciones">/);
  assert.equal(count(html, /aria-current="page"/g), 1);
  assert.match(adminViews.page({}, { session: null }), /<main[^>]* id="main"/);
});

test("admin navigation excludes the demo store while preserving its sections", () => {
  const html = adminHtml("metricas");
  assert.doesNotMatch(html, /open-demo|Abrir tienda de demo/);
  for (const section of ["metricas", "dominios", "cache"]) {
    assert.match(html, new RegExp('data-section="' + section + '"'));
  }
});

test("empty domain policies render a dedicated empty state and keep the add controls", () => {
  const html = adminHtml("dominios", { domainsDraft: [] });
  assert.deepEqual(problems(html), []);
  assert.match(html, /class="card panel-status domains-empty"[^>]*>Todavía no hay dominios en la lista\./);
  assert.match(html, /name="newDomain"/);
  assert.match(html, /data-action="add-domain"/);
  assert.doesNotMatch(html, /<table/);
});

test("admin tables name their columns and rows, and the actions column has a hidden name", () => {
  const html = adminHtml("dominios");
  assert.match(html, /<caption class="sr-only">Dominios con política propia<\/caption>/);
  assert.match(html, /<th scope="col"><span class="sr-only">Acciones<\/span><\/th>/);
  assert.match(html, /aria-label="Quitar pago-servicios-linea\.net"/);
  assert.match(html, /aria-label="Bloqueo duro para pago-servicios-linea\.net"/);
  assert.match(adminHtml("metricas"), /<caption class="sr-only">Últimas consultas<\/caption>/);
});

test("admin inputs have programmatic labels and the chart is exposed as one image", () => {
  const domains = adminHtml("dominios");
  assert.match(domains, /name="newDomain"[^>]*aria-label="Dominio a agregar"/);
  assert.match(domains, /role="group" aria-label="Política del dominio nuevo"/);
  const cache = adminHtml("cache");
  assert.match(cache, /<label class="ttl-label" for="ttl-phishing">/);
  assert.match(cache, /id="ttl-phishing"/);
  assert.match(cache, /name="invalidateDomain"[^>]*aria-label="Dominio a invalidar"/);
  const metrics = adminHtml("metricas");
  assert.match(metrics, /<div class="chart" role="img" aria-label="[^"]*consultas por hora[^"]*">/i);
  assert.match(metrics, /<div class="stat-bars stat-bars-[a-z]+" aria-hidden="true">/);
  assert.match(metrics, /data-action="toggle-queries" aria-expanded="false"/);
});

/* ---------------- standalone pages ---------------- */

const TITLE_PATTERN = /<title(?:\s+[^<>]*)?>\s*[^\s<][^<]*<\/title\s*>/i;

test("title check accepts attributes but rejects empty or missing text", () => {
  assert.match('<title data-i18n="title">Sereno</title>', TITLE_PATTERN);
  assert.doesNotMatch('<title data-i18n="title">  </title>', TITLE_PATTERN);
  assert.doesNotMatch('<title data-i18n="title"></title>', TITLE_PATTERN);
  assert.doesNotMatch('<title data-i18n="title"><span>Sereno</span></title>', TITLE_PATTERN);
});

test("static pages declare their language, one h1, a main landmark and no page-wide live region", () => {
  for (const file of ["app/popup/popup.html", "app/admin/admin.html", "app/privacy/privacy.html", "app/demo-store/store.html"]) {
    const html = read(file);
    assert.match(html, /<html lang="es">/, file);
    assert.match(html, TITLE_PATTERN, file);
    assert.doesNotMatch(html, /id="app"[^>]*aria-live/, `${file}: a whole-app live region announces every render`);
  }
  const privacy = read("app/privacy/privacy.html");
  assert.equal(count(privacy, /<h1\b/g), 1);
  assert.match(privacy, /<article class="privacy-card" aria-labelledby="privacy-title">/);
  assert.deepEqual(problems(privacy), []);
  const store = read("app/demo-store/store.html");
  assert.equal(count(store, /<h1\b/g), 1);
  assert.equal(count(store, /<main\b/g), 1);
  assert.deepEqual(problems(store), []);
  assert.match(store, /<main[^>]*>[\s\S]*id="demo-panel"/);
});

/* ---------------- keyboard helpers ---------------- */

test("rovingIndex moves along a horizontal tablist with wrap, Home and End", () => {
  const { rovingIndex } = Sereno.ui;
  assert.equal(rovingIndex(2, 0, "ArrowRight", "horizontal"), 1);
  assert.equal(rovingIndex(2, 1, "ArrowRight", "horizontal"), 0);
  assert.equal(rovingIndex(2, 0, "ArrowLeft", "horizontal"), 1);
  assert.equal(rovingIndex(3, 1, "Home", "horizontal"), 0);
  assert.equal(rovingIndex(3, 1, "End", "horizontal"), 2);
  assert.equal(rovingIndex(3, 1, "ArrowDown", "horizontal"), -1);
  assert.equal(rovingIndex(3, 1, "a", "horizontal"), -1);
  assert.equal(rovingIndex(3, 2, "ArrowDown", "vertical"), 0);
  assert.equal(rovingIndex(3, 0, "ArrowUp", "vertical"), 2);
  assert.equal(rovingIndex(0, 0, "ArrowRight", "horizontal"), -1);
});

test("trapTab keeps Tab and Shift+Tab inside a container", () => {
  const first = { id: "a" };
  const last = { id: "b" };
  let focused = null;
  first.focus = () => { focused = first; };
  last.focus = () => { focused = last; };
  const container = { querySelectorAll: () => [first, last] };
  const doc = { activeElement: last };
  let prevented = 0;
  const press = (shiftKey) => Sereno.ui.trapTab({ key: "Tab", shiftKey, preventDefault: () => { prevented += 1; } }, container, doc);
  press(false);
  assert.equal(focused, first);
  doc.activeElement = first;
  press(true);
  assert.equal(focused, last);
  doc.activeElement = { id: "inside" };
  focused = null;
  press(false);
  assert.equal(focused, null, "focus in the middle is left alone");
  assert.equal(prevented, 2);
});

test("captureFocus restores focus on the element that matches after a re-render", () => {
  const target = { focused: false, focus() { this.focused = true; } };
  let selector = null;
  const active = {
    tagName: "BUTTON",
    getAttribute: (name) => ({ "data-action": "filter", "data-filter": "bloqueo" })[name] || null
  };
  const root = {
    contains: (node) => node === active,
    querySelector: (query) => { selector = query; return target; }
  };
  const restore = Sereno.ui.captureFocus(root, { activeElement: active });
  restore();
  assert.equal(selector, 'button[data-action="filter"][data-filter="bloqueo"]');
  assert.equal(target.focused, true);
  const idle = Sereno.ui.captureFocus(root, { activeElement: { tagName: "BODY", getAttribute: () => null } });
  assert.doesNotThrow(idle);
});

test("captureFocus restores the selected language radio after a live rerender", () => {
  const active = { tagName: "INPUT", getAttribute: (name) => ({ id: "language-en", name: "language" })[name] || null };
  let selector;
  let focused = false;
  const root = { contains: (node) => node === active, querySelector: (value) => { selector = value; return { focus: () => { focused = true; } }; } };
  Sereno.ui.captureFocus(root, { activeElement: active })();
  assert.equal(selector, 'input[id="language-en"][name="language"]');
  assert.equal(focused, true);
});

test("the admin page shows a loading status until its first render replaces it", () => {
  assert.match(read("app/admin/admin.html"), /<div id="app" class="options-shell">\s*<div class="card panel-status" role="status">Cargando el panel\.\.\.<\/div>\s*<\/div>/);
});

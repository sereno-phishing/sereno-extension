"use strict";

/* The current site is shown to everyone (signed out, user, admin) and the
   footer reports one model version no matter who is signed in. String level. */

const test = require("node:test");
const assert = require("node:assert/strict");
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
  "administration/ui/administration-views.js", "app/popup/popup-views.js"
);
const { popupViews } = Sereno;

const SITE = { domain: "tienda-servicios.pe", status: "seguro", score: 0.04, source: "modelo", ts: "2026-09-21T09:12:00" };
const USER = { username: "ana", isAdmin: false };
const ADMIN = { username: "admin", isAdmin: true };
const BASE = { view: "home", historyFilter: Sereno.history.ALL, onboardingStep: 1, surveyIndex: 0, surveyAnswers: [] };
const render = (session, extra = {}, model = {}) =>
  popupViews.page({ ...BASE, modelVersion: "1.3", ...model }, { session, currentSite: SITE, lastSeenModelVersion: "1.2", ...extra });
const count = (html, pattern) => (html.match(pattern) || []).length;

test("signed out, user and admin all see the current site", () => {
  for (const [name, session] of [["signed out", null], ["user", USER], ["admin", ADMIN]]) {
    const html = render(session);
    assert.equal(count(html, /class="site-card/g), 1, name);
    assert.match(html, /tienda-servicios\.pe/, name);
  }
});

test("the icon legend stays signed-out only", () => {
  assert.match(render(null), /icon-legend/);
  assert.doesNotMatch(render(USER), /icon-legend/);
  assert.doesNotMatch(render(ADMIN), /icon-legend/);
});

test("for a user the site card sits inside the home tab panel, between the protection card and the notice", () => {
  const html = render(USER);
  const start = html.indexOf('<div class="tab-panel" role="tabpanel" id="tabpanel-home"');
  assert.ok(start >= 0, "tabpanel wrapper");
  const panel = html.slice(start);
  const protection = panel.indexOf("protection-card");
  const site = panel.indexOf("site-card");
  const notice = panel.indexOf("notice-card");
  assert.ok(protection >= 0 && site > protection && notice > site, "order protection, site, notice");
  assert.equal(count(html, /<h1\b/g), 1);
});

test("admin home exposes history tabs and the administration entry", () => {
  const html = Sereno.popupViews.page(BASE, { session: ADMIN });
  assert.match(html, /data-tab="history"/);
  assert.match(html, /id="tabpanel-home"/);
  assert.match(html, /data-action="open-admin"/);
});

test("for an admin the site card sits between the protection card and the admin card", () => {
  const html = render(ADMIN);
  const protection = html.indexOf("protection-card");
  const site = html.indexOf("site-card");
  const admin = html.indexOf("admin-card");
  assert.ok(protection >= 0 && site > protection && admin > site);
  assert.equal(count(html, /<h1\b/g), 1);
});

test("the site card of a user reflects a degraded protection level", () => {
  const html = render(USER, { protectionLevel: "degraded", currentSite: { domain: "x.pe", status: "pendiente" } });
  assert.match(html, /is-degraded/);
});

test("the footer shows the same backend version signed in and signed out", () => {
  for (const session of [null, USER, ADMIN]) {
    assert.match(render(session), /Modelo v1\.3/);
    assert.doesNotMatch(render(session), /Modelo v1\.2/);
  }
});

test("the update notice needs a signed-in user and a backend version different from the last one seen", () => {
  assert.doesNotMatch(render(null), /Modelo actualizado/);
  assert.match(render(USER), /Modelo actualizado a v1\.3/);
  assert.match(render(ADMIN), /Modelo actualizado a v1\.3/);
  assert.doesNotMatch(render(USER, { lastSeenModelVersion: "1.3" }), /Modelo actualizado/);
  assert.doesNotMatch(render(USER, {}, { modelVersion: null }), /Modelo actualizado/);
});

test("an old saved state with modelNoticeDismissed true does not show the notice", () => {
  const html = render(USER, { modelNoticeDismissed: true });
  assert.doesNotMatch(html, /Modelo actualizado/);
  assert.match(html, /Modelo v1\.3/);
});

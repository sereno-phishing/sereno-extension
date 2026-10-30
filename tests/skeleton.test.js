"use strict";

/* Loading skeletons: one shared primitive in tokens.css, shapes that mirror the
   loaded layout, decorative blocks hidden from assistive technology and the
   loading text kept for screen readers. String-level checks only. */

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
  "administration/domain/domain-policy.js", "administration/domain/verdict-cache.js",
  "verdict/ui/verdict-ui.js", "history/ui/history-views.js", "survey/ui/survey-views.js",
  "administration/ui/administration-views.js", "app/admin/admin-views.js"
);

const { ui, historyUi, surveyUi, administrationUi, adminViews } = Sereno;
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const count = (html, pattern) => (html.match(pattern) || []).length;

function assertSkeletonRegion(html, label, minBlocks) {
  assert.match(html, /role="status"/, `${label}: keeps its status region`);
  assert.match(html, /<[^>]*class="[^"]*sr-only[^"]*"[^>]*>[^<]*(Cargando|Enviando)/, `${label}: loading text stays, visually hidden`);
  const blocks = html.match(/<span class="skeleton [^"]*"[^>]*>/g) || [];
  assert.ok(blocks.length >= minBlocks, `${label}: at least ${minBlocks} skeleton blocks, got ${blocks.length}`);
  blocks.forEach((block) => assert.match(block, /aria-hidden="true"/, `${label}: ${block}`));
}

/* ---------------- stylesheet contract ---------------- */

test("tokens.css defines the shared skeleton, the easing tokens and a compositor-only sweep", () => {
  const css = read("ui/tokens.css");
  assert.match(css, /--ease-out:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  assert.match(css, /--ease-in-out:\s*cubic-bezier\(0\.77, 0, 0\.175, 1\)/);
  const base = css.match(/\n\.skeleton\s*\{([^}]*)\}/);
  assert.ok(base, "a .skeleton rule exists");
  assert.match(base[1], /overflow:\s*hidden/);
  const sweep = css.match(/\.skeleton::after\s*\{([^}]*)\}/);
  assert.ok(sweep, "the sweep is a pseudo-element");
  assert.match(sweep[1], /animation:\s*skeleton-sweep 1\.6s var\(--ease-in-out\) infinite/);
  const keyframes = css.match(/@keyframes skeleton-sweep\s*\{([\s\S]*?)\n\}/);
  assert.ok(keyframes, "skeleton-sweep keyframes exist");
  assert.match(keyframes[1], /transform:\s*translateX\(/);
  assert.doesNotMatch(keyframes[1], /background-position|left|width|opacity/);
  ["line", "circle", "pill", "rect"].forEach((shape) => assert.match(css, new RegExp("\\.skeleton-" + shape + "\\s*\\{")));
});

test("the skeleton sweep is off for reduced motion", () => {
  const css = read("ui/tokens.css");
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, "tokens.css has a reduce block");
  assert.match(block[1], /\.skeleton::after\s*\{\s*animation:\s*none/);
});

test("no stylesheet keeps the retired boot pulse or transitions every property", () => {
  const popup = read("app/popup/popup.css");
  assert.doesNotMatch(popup, /boot-pulse|\.boot-skeleton-line|\.boot-skeleton-label/);
  ["ui/tokens.css", "app/popup/popup.css", "app/admin/admin.css"].forEach((file) => {
    assert.doesNotMatch(read(file), /transition:\s*all/, file);
  });
});

/* ---------------- helper ---------------- */

test("ui.skeleton returns one decorative block and defaults to a line", () => {
  assert.equal(ui.skeleton(), '<span class="skeleton skeleton-line" aria-hidden="true"></span>');
  assert.equal(ui.skeleton({ shape: "circle", cls: "x" }), '<span class="skeleton skeleton-circle x" aria-hidden="true"></span>');
});

/* ---------------- popup ---------------- */

test("the popup boot skeleton is built on the shared primitive", () => {
  const html = read("app/popup/popup.html");
  const boot = html.match(/<div class="boot-skeleton"[\s\S]*?<\/div>/)[0];
  assert.match(boot, /role="status"/);
  assert.equal(count(boot, /class="skeleton /g), 3);
  assert.equal(count(boot, /aria-hidden="true"/g), 3);
  assert.match(boot, /class="boot-skeleton-label sr-only"[^>]*>Cargando Sereno\.\.\./);
});

test("history loading shows entry-shaped rows and keeps the loading text for assistive technology", () => {
  const html = historyUi.listView({ tabsHtml: "", entries: [], filter: "todas", loading: true });
  assertSkeletonRegion(html, "history", 12);
  assert.equal(count(html, /class="history-skeleton-row"/g), 5);
  assert.match(html, /class="history-list[^"]*"/);
  assert.doesNotMatch(html, /empty-circle|empty-state/);
});

test("survey status loading and submitting show a skeleton line with hidden text", () => {
  assertSkeletonRegion(surveyUi.statusView({ state: "loading" }), "survey status", 1);
  assertSkeletonRegion(surveyUi.resultView({ state: "submitting" }), "survey submitting", 1);
});

/* ---------------- admin ---------------- */

test("each admin section loads with a skeleton shaped like the section", () => {
  const sections = {
    metricas: { min: 14, markers: [/class="stat-grid"/, /class="card chart-card"/, /class="card table-card"/] },
    dominios: { min: 8, markers: [/class="card add-domain"/, /class="card table-card"/] },
    cache: { min: 8, markers: [/class="cache-grid"/, /class="card table-card"/] }
  };
  Object.entries(sections).forEach(([id, spec]) => {
    const html = administrationUi.statusSection({ id, title: "T", state: "loading" });
    assertSkeletonRegion(html, id, spec.min);
    spec.markers.forEach((marker) => assert.match(html, marker, id));
    assert.equal(count(html, /<h1\b/g), 1, id);
    assert.doesNotMatch(html, /panel-status/, id);
  });
  assert.equal(count(administrationUi.statusSection({ id: "metricas", title: "T", state: "loading" }), /class="stat-card"/g), 4);
});

test("the admin loading page shows the sidebar and content shapes and is mirrored in admin.html", () => {
  const page = adminViews.loadingPage("Cargando el panel...");
  assertSkeletonRegion(page, "admin page", 8);
  assert.match(page, /class="sidebar"/);
  assert.match(page, /<main class="options-content"/);
  const html = read("app/admin/admin.html");
  assert.match(html, /<div id="app" class="options-shell">[\s\S]*class="sidebar"[\s\S]*role="status"[\s\S]*Cargando el panel\.\.\.[\s\S]*<\/div>\s*<script/);
  assert.doesNotMatch(html, /class="card panel-status"/);
});

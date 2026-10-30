"use strict";

/* Motion language. Every animation has a named purpose, uses transform and
   opacity only, stays within the UI duration budget and has a reduced-motion
   counterpart. Entrance animations hang on a one-shot data-enter hook that the
   views emit only for the render that follows the real state change, because
   the containers redraw with innerHTML and a CSS animation on a fresh node
   would otherwise replay on every unrelated redraw. String-level checks only. */

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
  "verdict/ui/verdict-ui.js", "account/ui/account-views.js", "history/ui/history-views.js",
  "survey/ui/survey-views.js", "administration/ui/administration-views.js"
);

const { accountUi, historyUi, surveyUi, administrationUi } = Sereno;
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const SHEETS = ["ui/tokens.css", "app/popup/popup.css", "app/admin/admin.css", "content/content.css"];

function stylesheets(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : stylesheets(full);
    }
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

/* Bodies of every `@media <query> { ... }` block in a stylesheet. */
function mediaBodies(css, query) {
  const bodies = [];
  const header = "@media (" + query + ")";
  let from = css.indexOf(header);
  while (from !== -1) {
    const open = css.indexOf("{", from);
    let depth = 1;
    let index = open + 1;
    while (depth > 0 && index < css.length) {
      depth += css[index] === "{" ? 1 : css[index] === "}" ? -1 : 0;
      index += 1;
    }
    bodies.push(css.slice(open + 1, index - 1));
    from = css.indexOf(header, index);
  }
  return bodies;
}

const reduced = (file) => mediaBodies(read(file), "prefers-reduced-motion: reduce").join("\n");

/* ---------------- stylesheet contract ---------------- */

test("no stylesheet transitions every property, uses ease-in or starts from scale(0)", () => {
  const files = stylesheets(ROOT);
  assert.ok(files.length >= 7, "found the stylesheets");
  files.forEach((file) => {
    const css = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(css, /transition:\s*all/, file);
    assert.doesNotMatch(css, /ease-in(?!-out)/, file);
    assert.doesNotMatch(css, /scale\(0\)/, file);
  });
});

test("animated declarations stay within the 300ms UI budget unless they loop", () => {
  SHEETS.forEach((file) => {
    const css = read(file);
    for (const [, kind, value] of css.matchAll(/(?:^|[\s;{])(animation|transition)\s*:\s*([^;]+);/g)) {
      if (/infinite/.test(value)) continue;
      for (const [, amount, unit] of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
        const ms = unit === "s" ? Number(amount) * 1000 : Number(amount);
        assert.ok(ms <= 300, `${file}: ${kind}: ${value} exceeds 300ms`);
      }
    }
  });
});

test("every keyframe animates transform and opacity only", () => {
  SHEETS.forEach((file) => {
    for (const [, name, body] of read(file).matchAll(/@keyframes ([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      const properties = [...body.matchAll(/([\w-]+)\s*:[^;{}]+;/g)].map((match) => match[1]);
      assert.ok(properties.length, `${name} declares something`);
      properties.forEach((property) => assert.match(property, /^(transform|opacity)$/, `${file}: ${name} animates ${property}`));
    }
  });
});

test("tokens.css owns the shared fade used as the reduced-motion entrance", () => {
  assert.match(read("ui/tokens.css"), /@keyframes motion-fade\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*\}/);
});

test("press feedback is a short transform transition and is off for reduced motion", () => {
  const tokens = read("ui/tokens.css");
  const popup = read("app/popup/popup.css");
  assert.match(tokens, /\.btn\s*\{[^}]*transition:\s*transform 160ms var\(--ease-out\)/);
  assert.match(tokens, /\.btn:active:not\(:disabled\)\s*\{\s*transform:\s*scale\(0\.97\)/);
  assert.match(tokens, /button\.avatar\s*\{\s*transition:\s*transform 160ms var\(--ease-out\)/);
  assert.match(tokens, /button\.avatar:active\s*\{\s*transform:\s*scale\(0\.97\)/);
  assert.match(popup, /\.scale-btn\s*\{[^}]*transition:\s*transform 160ms var\(--ease-out\)/);
  assert.match(popup, /\.scale-btn:active\s*\{\s*transform:\s*scale\(0\.97\)/);
  assert.match(popup, /\.menu-item\s*\{[^}]*transition:\s*transform 160ms var\(--ease-out\)/);
  assert.match(popup, /\.menu-item:active\s*\{\s*transform:\s*scale\(0\.97\)/);
  assert.match(reduced("ui/tokens.css"), /\.btn:active:not\(:disabled\)[\s\S]*button\.avatar:active[\s\S]*transform:\s*none/);
  assert.match(reduced("app/popup/popup.css"), /\.scale-btn:active[\s\S]*\.menu-item:active[\s\S]*transform:\s*none/);
});

test("one-shot entrances are keyed on data-enter and fall back to a fade for reduced motion", () => {
  const popup = read("app/popup/popup.css");
  const admin = read("app/admin/admin.css");
  const entrances = [
    [popup, ".account-menu[data-enter]", "menu-enter 150ms var(--ease-out)"],
    [popup, ".view-survey[data-enter] .survey-question", "question-enter 180ms var(--ease-out)"],
    [popup, ".view-survey[data-enter] .progress-fill", "progress-advance 240ms var(--ease-out)"],
    [popup, ".sus-result h1[data-enter]", "thanks-enter 300ms var(--ease-out)"],
    [popup, ".history-list[data-enter] .history-item", "history-item-enter 200ms var(--ease-out) both"],
    [admin, ".chart[data-enter] .chart-bar", "chart-bar-grow 300ms var(--ease-out) both"]
  ];
  entrances.forEach(([css, selector, animation]) => {
    const escaped = selector.replace(/[.[\]]/g, "\\$&");
    assert.match(css, new RegExp(escaped + "\\s*\\{[^}]*animation:\\s*" + animation.replace(/[()]/g, "\\$&")), selector);
  });
  const popupReduced = reduced("app/popup/popup.css");
  [".account-menu[data-enter]", ".view-survey[data-enter] .survey-question", ".view-survey[data-enter] .progress-fill",
    ".sus-result h1[data-enter]", ".history-list[data-enter] .history-item"].forEach((selector) => {
    assert.ok(popupReduced.includes(selector), selector + " has a reduced-motion rule");
  });
  assert.ok(reduced("app/admin/admin.css").includes(".chart[data-enter] .chart-bar"));
  assert.match(popupReduced, /\.account-menu\[data-enter\],[^{]*\{\s*animation-name:\s*motion-fade/);
  assert.match(popupReduced, /\.view-survey\[data-enter\] \.progress-fill\s*\{\s*animation:\s*none/);
});

test("the account menu grows from the avatar corner and the progress fill moves by translation only", () => {
  const popup = read("app/popup/popup.css");
  assert.match(popup, /\.account-menu\s*\{[^}]*transform-origin:\s*top right/);
  assert.match(popup, /@keyframes menu-enter\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*scale\(0\.95\);/);
  assert.match(popup, /@keyframes progress-advance\s*\{\s*from\s*\{\s*transform:\s*translateX\(var\(--progress-from\)\);/);
  const fill = popup.match(/\.progress-fill\s*\{([^}]*)\}/)[1];
  assert.match(fill, /width:\s*100%/);
});

test("chart bars grow from the baseline, staggered and capped", () => {
  const admin = read("app/admin/admin.css");
  assert.match(admin, /\.chart\[data-enter\] \.chart-bar\s*\{[^}]*transform-origin:\s*bottom/);
  assert.match(admin, /animation-delay:\s*calc\(min\(var\(--i\), \d+\) \* 25ms\)/);
  assert.match(admin, /@keyframes chart-bar-grow\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*scaleY\(0\.\d+\);/);
});

test("the verdict dialog fades in and scales from 0.98 only when motion is allowed", () => {
  const css = read("content/content.css");
  assert.match(css, /\.verdict-dialog\[open\] \.verdict-modal\s*\{\s*transition:\s*opacity 200ms var\(--ease-out\);/);
  assert.match(css, /\.verdict-dialog\[open\]::backdrop\s*\{[^}]*opacity:\s*1;[^}]*transition:\s*opacity 200ms var\(--ease-out\);/);
  assert.match(css, /@starting-style\s*\{[^@]*\.verdict-dialog\[open\] \.verdict-modal\s*\{\s*opacity:\s*0;/);
  const allowed = mediaBodies(css, "prefers-reduced-motion: no-preference").join("\n");
  assert.match(allowed, /\.verdict-dialog\[open\] \.verdict-modal\s*\{\s*transition:\s*opacity 200ms var\(--ease-out\), transform 200ms var\(--ease-out\);/);
  assert.match(allowed, /@starting-style\s*\{\s*\.verdict-dialog\[open\] \.verdict-modal\s*\{\s*transform:\s*scale\(0\.98\);/);
  const outside = mediaBodies(css, "prefers-reduced-motion: no-preference").reduce((rest, body) => rest.replace(body, ""), css);
  assert.doesNotMatch(outside, /scale\(0\.98\)/);
});

test("the tab indicator slide fits the UI budget with the in-out curve", () => {
  const popup = read("app/popup/popup.css");
  assert.match(popup, /animation: tab-indicator-slide 240ms var\(--ease-in-out\)/);
});

/* ---------------- one-shot hooks in the views ---------------- */

const SESSION = { username: "ana", isAdmin: false };

test("the account menu carries the entrance hook only when asked", () => {
  assert.match(accountUi.accountMenu(SESSION, { enter: true }), /<div class="account-menu" data-enter data-action="menu-content"/);
  assert.doesNotMatch(accountUi.accountMenu(SESSION, {}), /data-enter/);
  assert.doesNotMatch(accountUi.accountMenu(SESSION), /data-enter/);
});

test("the survey question animates only after the question index changed", () => {
  const changed = surveyUi.questionView({ index: 1, selected: null, from: 0 });
  assert.match(changed, /<section class="view view-survey" data-enter>/);
  assert.match(changed, /style="transform:translateX\(-80%\);--progress-from:-90%"/);
  const forward = surveyUi.questionView({ index: 0, selected: null, from: 1 });
  assert.match(forward, /style="transform:translateX\(-90%\);--progress-from:-80%"/);
  [{ index: 1, selected: null }, { index: 1, selected: 3 }, { index: 1, selected: 3, from: null }].forEach((model) => {
    const html = surveyUi.questionView(model);
    assert.doesNotMatch(html, /data-enter|--progress-from/);
  });
});

test("the progress fill is positioned by translation and keeps the same value and label", () => {
  const html = surveyUi.questionView({ index: 3, selected: 2 });
  assert.match(html, /aria-valuenow="40"/);
  assert.match(html, /<div class="progress-fill" style="transform:translateX\(-60%\)"><\/div>/);
  assert.doesNotMatch(html, /width:/);
  assert.match(surveyUi.questionView({ index: 9, selected: 2 }), /style="transform:translateX\(0%\)"/);
});

test("the thank-you entrance is calm, once, and not shown for an earlier submission", () => {
  assert.match(surveyUi.resultView({ state: "accepted", enter: true }), /<h1 role="status" data-enter>/);
  assert.doesNotMatch(surveyUi.resultView({ state: "accepted" }), /data-enter/);
  assert.doesNotMatch(surveyUi.resultView({ state: "already", enter: true }), /data-enter/);
  assert.doesNotMatch(surveyUi.resultView({ state: "error", error: "offline", enter: true }), /data-enter/);
  assert.doesNotMatch(surveyUi.resultView({ state: "submitting", enter: true }), /data-enter/);
});

const ENTRIES = [0, 1, 2].map((n) => ({ id: "h-" + n, domain: "site" + n + ".pe", status: "seguro", score: 0.1, source: "modelo", ts: "2026-09-21T10:0" + n }));
const listModel = (extra) => Object.assign({ tabsHtml: "", entries: ENTRIES, filter: "todas" }, extra);

test("history rows stagger in only when the list is flagged as just loaded", () => {
  const html = historyUi.listView(listModel({ enter: true }));
  assert.match(html, /<div class="history-list" data-enter>/);
  ENTRIES.forEach((entry, index) => {
    assert.match(html, new RegExp('<button type="button" class="history-item" style="--i:' + index + '" data-action="open-detail" data-id="' + entry.id + '">'));
  });
  const plain = historyUi.listView(listModel());
  assert.doesNotMatch(plain, /data-enter|--i:/);
  assert.match(plain, /<button type="button" class="history-item" data-action="open-detail"/);
  assert.doesNotMatch(historyUi.listView(listModel({ entries: [], loading: true, enter: true })), /data-enter/);
});

const METRICS = {
  analyzed: 42, deltaPct: 1, phishingPct: 2, phishingCount: 3, latencyMs: 4, latencyTargetMs: 5, cacheHitPct: 6,
  hourly: [{ level: "seguro", height: 20 }, { level: "bloqueo", height: 40 }], queries: []
};

test("chart bars carry the entrance hook only on the render that follows the first data", () => {
  const html = administrationUi.metricsSection({ metrics: METRICS, enter: true });
  assert.match(html, /<div class="chart" data-enter role="img"/);
  assert.match(html, /<span class="chart-bar level-seguro" style="height:20px;--i:0"><\/span>/);
  assert.match(html, /<span class="chart-bar level-bloqueo" style="height:40px;--i:1"><\/span>/);
  const plain = administrationUi.metricsSection({ metrics: METRICS });
  assert.doesNotMatch(plain, /data-enter|--i:/);
  assert.match(plain, /<span class="chart-bar level-seguro" style="height:20px"><\/span>/);
});

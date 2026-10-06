"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load } = require("./load");

const { ui } = load("ui/atoms.js");
const ROOT = path.join(__dirname, "..");

// Isolate the page composition while rendering its real shared tab markup.
function popupViews() {
  const Sereno = {
    ui,
    account: { isAdmin: () => false },
    accountUi: { accountButton: () => "" },
    history: { entriesOf: () => [] },
    historyUi: { listView: ({ tabsHtml }) => `<section class="view view-history">${tabsHtml}</section>` },
    protection: { isNoticeVisible: () => false },
    protectionUi: { protectionCard: () => "", modelVersionLabel: () => "" }
  };
  const context = vm.createContext({ Sereno });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app/popup/popup-views.js"), "utf8"), context);
  return Sereno.popupViews;
}

test("home and history use the same large tab variant with only selection state changing", () => {
  const views = popupViews();
  const state = { session: { username: "user", role: "user" }, history: {} };
  const tablists = ["home", "history"].map((view) => {
    const html = views.page({ view, historyFilter: "all" }, state);
    const tablist = html.match(/<div class="tabs tabs-lg" role="tablist"[^>]*>.*?<\/div>/);
    assert.ok(tablist, `${view} uses the common tab size`);
    const active = view === "home" ? "home" : "history";
    assert.match(tablist[0], new RegExp(`data-tab="${active}" class="active" aria-selected="true"`));
    assert.equal((tablist[0].match(/data-action="tab"/g) || []).length, 2);
    assert.doesNotMatch(tablist[0], /data-tab-slide/);
    return tablist[0].replace(/class="active"/g, 'class=""').replace(/aria-selected="true"/g, 'aria-selected="false"').replace(/data-active-tab="(?:home|history)"/g, 'data-active-tab="selected"');
  });
  assert.equal(tablists[0], tablists[1]);
});

test("tab indicator requests animation only for the destination of an explicit tab change", () => {
  const views = popupViews();
  const state = { session: { username: "user", role: "user" }, history: {} };
  for (const view of ["home", "history"]) {
    const html = views.page({ view, tabSlide: view }, state);
    assert.match(html, new RegExp(`data-active-tab="${view}" data-tab-slide="${view}"`));
    const opposite = view === "home" ? "history" : "home";
    assert.doesNotMatch(views.page({ view, tabSlide: opposite }, state), /data-tab-slide/);
  }
});

test("tab indicator motion is transform-only, 400ms and disabled for reduced motion", () => {
  const css = fs.readFileSync(path.join(ROOT, "app/popup/popup.css"), "utf8");
  assert.match(css, /animation: tab-indicator-slide 400ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.app-shell \.tabs\[data-tab-slide\]::before\s*\{\s*animation: none;/);
  const indicator = css.match(/\.app-shell \.tabs::before\s*\{([^}]*)\}/)[1];
  assert.match(indicator, /position: absolute;/);
  assert.match(indicator, /width: calc\(50% - 6px\);/);
  assert.match(indicator, /pointer-events: none;/);
});

test("history padding matches home on all sides to keep tabs aligned", () => {
  const css = fs.readFileSync(path.join(ROOT, "app/popup/popup.css"), "utf8");
  const home = css.match(/\.view-home\s*\{([^}]*)\}/)[1];
  const history = css.match(/\.view-history\s*\{([^}]*)\}/)[1];
  const homePadding = home.match(/\bpadding:\s*(\d+px);/)[1];
  const historyPadding = history.match(/\bpadding:\s*(\d+px);/)[1];
  assert.equal(historyPadding, homePadding);
  assert.match(history, /gap: 12px;/);
  assert.doesNotMatch(history, /(?:^|;)\s*(?:padding-inline|padding-block|width):/);
});

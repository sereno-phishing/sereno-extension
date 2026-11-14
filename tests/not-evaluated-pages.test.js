"use strict";

/* The popup describes the active tab. A page Sereno never evaluates (not
   http(s), or a page of the verdict backend) publishes the explicit
   "not evaluated" site instead of keeping the last evaluated one; going back
   to an evaluated tab shows that tab's stored outcome again. Such pages get no
   request, no tab message, no painted badge and no history entry. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { createRestFake } = require("./rest-fake");

const Sereno = load(
  "time/domain/time.js",
  "platform/providers/ports.js",
  "platform/providers/remote.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "verdict/application/verdict-service.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "protection/application/navigation-service.js"
);

const nav = Sereno.navigationService;
const outcomes = Sereno.verdictOutcome;
const BASE_URL = "http://127.0.0.1:5000";
const OWN_PAGE = BASE_URL + "/dev/users";
const WARNED = "https://paypal-secure-login.com/login";
const DETAIL_PAGE = "chrome-extension://sereno/app/popup/popup.html";
const NOW = new Date(2026, 10, 13, 10, 0, 0);
const NOT_EVALUATED = { currentSite: { kind: "not_evaluated" } };

const SKIPPED = [
  "chrome://newtab/",
  "chrome://extensions/",
  "edge://settings/",
  "chrome-extension://another-extension/page.html",
  "chrome-extension://sereno/app/admin/admin.html",
  "file:///C:/Users/ana/factura.html",
  "about:blank",
  OWN_PAGE
];
const UNKNOWN = [undefined, null, "", "not a url"];

/* urls: what each tab shows, by tab id; active: the id of the active tab. */
function fakeBrowser(urls, active) {
  const records = new Map();
  const calls = [];
  return {
    calls,
    records,
    urls,
    active,
    async setBadge(tabId, text, color) {
      calls.push({ op: "badge", tabId, text, color });
    },
    async notifyTab(tabId, message) {
      calls.push({ op: "notify", tabId, message });
    },
    async getActiveTabId() {
      return this.active;
    },
    async getTabUrl(tabId) {
      return this.urls[tabId];
    },
    assetUrl(path) {
      return "chrome-extension://sereno/" + path;
    },
    async loadTabRecord(tabId) {
      return records.has(tabId) ? JSON.parse(JSON.stringify(records.get(tabId))) : null;
    },
    async saveTabRecord(tabId, record) {
      records.set(tabId, JSON.parse(JSON.stringify(record)));
    },
    async removeTabRecord(tabId) {
      records.delete(tabId);
    }
  };
}

async function setup(urls, active) {
  const backend = createRestFake({ baseUrl: BASE_URL, now: () => NOW });
  const services = Sereno.providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 500, fetch: backend });
  await backend(BASE_URL + "/v1/auth/login", { method: "POST", body: JSON.stringify({ username: "andres.torres", password: "sereno123" }) });
  backend.calls.length = 0;
  const patches = [];
  const browser = fakeBrowser(urls || {}, active === undefined ? 1 : active);
  const deps = {
    services,
    store: {
      async set(patch) {
        patches.push(patch);
      }
    },
    browser,
    now: () => NOW,
    options: { pendingAfterMs: 5000 }
  };
  const activate = async (tabId) => {
    browser.active = tabId;
    await nav.handleTabActivated(deps, { tabId });
  };
  return { backend, deps, browser, patches, activate };
}

const verdictRequests = (backend) => backend.calls.filter((call) => call.path === "/v1/verdict").map((call) => call.body.url);
const messagesOf = (browser) => browser.calls.filter((call) => call.op === "notify");
const paintedBadges = (browser) => browser.calls.filter((call) => call.op === "badge" && call.text !== "");
const clearedBadges = (browser, tabId) => browser.calls.filter((call) => call.op === "badge" && call.tabId === tabId && call.text === "");
const last = (list) => list[list.length - 1];

test("the domain names the site of a page that is never evaluated", () => {
  assert.deepEqual(outcomes.notEvaluatedSite(), { kind: "not_evaluated" });
  assert.equal(outcomes.isNotEvaluatedSite(outcomes.notEvaluatedSite()), true);
  const evaluated = outcomes.siteOf(outcomes.pending(), WARNED, "t");
  [null, undefined, {}, evaluated, { kind: "verdict" }, "not_evaluated"].forEach((site) => {
    assert.equal(outcomes.isNotEvaluatedSite(site), false, JSON.stringify(site));
  });
});

test("evaluated tab -> browser page tab -> back keeps the popup truthful in both directions", async () => {
  const context = await setup({ 1: WARNED, 2: "chrome://newtab/" });

  await nav.handleNavigation(context.deps, { tabId: 1, url: WARNED, fresh: true });
  assert.equal(last(context.patches).currentSite.status, "advertencia");
  const historyBefore = JSON.stringify(context.backend.state.history);
  context.browser.calls.length = 0;

  await context.activate(2);
  assert.deepEqual(last(context.patches), NOT_EVALUATED);
  assert.equal(clearedBadges(context.browser, 2).length, 1, "the badge of the browser page stays cleared");
  assert.deepEqual(paintedBadges(context.browser), []);
  assert.equal(context.browser.records.has(2), false);

  await context.activate(1);
  assert.equal(last(context.patches).currentSite.domain, "paypal-secure-login.com");
  assert.equal(last(context.patches).currentSite.status, "advertencia");
  assert.equal(last(context.patches).protectionLevel, "active");
  assert.equal(last(paintedBadges(context.browser)).tabId, 1);

  assert.deepEqual(verdictRequests(context.backend), [WARNED], "going back uses the stored outcome");
  assert.deepEqual(messagesOf(context.browser), [], "the modal is not shown again");
  assert.equal(JSON.stringify(context.backend.state.history), historyBefore);
});

test("every kind of page Sereno skips publishes the not-evaluated site, on navigation and on activation", async () => {
  for (const url of SKIPPED) {
    const navigated = await setup({ 1: url });
    assert.equal(await nav.handleNavigation(navigated.deps, { tabId: 1, url, fresh: true }), null, url);
    assert.equal(await nav.handleNavigation(navigated.deps, { tabId: 1, url }), null, url);
    assert.ok(navigated.patches.length > 0, url);
    navigated.patches.forEach((patch) => assert.deepEqual(patch, NOT_EVALUATED, url));

    const activated = await setup({ 1: url });
    await activated.activate(1);
    assert.deepEqual(activated.patches, [NOT_EVALUATED], url);

    [navigated, activated].forEach((context) => {
      assert.deepEqual(context.backend.calls, [], url);
      assert.deepEqual(messagesOf(context.browser), [], url);
      assert.deepEqual(paintedBadges(context.browser), [], url);
      assert.ok(clearedBadges(context.browser, 1).length > 0, url);
      assert.equal(context.browser.records.size, 0, url);
    });
  }
});

test("a tab that leaves an evaluated site for a browser page drops that verdict", async () => {
  const { backend, deps, browser, patches, activate } = await setup({ 1: WARNED });
  await nav.handleNavigation(deps, { tabId: 1, url: WARNED, fresh: true });
  browser.calls.length = 0;

  browser.urls[1] = "chrome://settings/";
  assert.equal(await nav.handleNavigation(deps, { tabId: 1, url: "chrome://settings/", fresh: true }), null);
  assert.deepEqual(last(patches), NOT_EVALUATED);
  assert.equal(browser.records.has(1), false);
  assert.equal(clearedBadges(browser, 1).length, 1);
  assert.deepEqual(await nav.handleMessage(deps, { type: "sereno:get-outcome" }, { tab: { id: 1 } }), { ok: true, outcome: null });

  /* Activating it again does not bring the old verdict back. */
  await activate(1);
  assert.deepEqual(last(patches), NOT_EVALUATED);
  assert.deepEqual(paintedBadges(browser), []);
  assert.deepEqual(verdictRequests(backend), [WARNED]);
});

test("a skipped page in a background tab does not touch the popup state", async () => {
  const { backend, deps, browser, patches } = await setup({ 1: WARNED, 2: "chrome://history/" }, 1);
  await nav.handleNavigation(deps, { tabId: 2, url: "chrome://history/", fresh: true });
  assert.deepEqual(patches, []);
  assert.deepEqual(backend.calls, []);
  assert.equal(clearedBadges(browser, 2).length, 1);
});

test("a tab whose address is unknown leaves the popup state alone, so a fresh session stays idle", async () => {
  for (const url of UNKNOWN) {
    const { backend, deps, browser, patches, activate } = await setup({ 1: url });
    await activate(1);
    assert.equal(await nav.handleNavigation(deps, { tabId: 1, url, fresh: true }), null);
    assert.deepEqual(patches, [], String(url));
    assert.deepEqual(browser.calls, [], String(url));
    assert.deepEqual(backend.calls, [], String(url));
  }

  const failing = await setup({});
  failing.browser.getTabUrl = async () => {
    throw new Error("No tab with id");
  };
  await failing.activate(1);
  assert.deepEqual(failing.patches, []);
});

test("the Sereno detail page keeps showing the site it was opened for", async () => {
  const { backend, deps, browser, patches, activate } = await setup({ 1: WARNED, 2: DETAIL_PAGE });
  await nav.handleNavigation(deps, { tabId: 1, url: WARNED, fresh: true });
  const shown = patches.length;
  browser.calls.length = 0;

  browser.active = 2;
  await nav.handleNavigation(deps, { tabId: 2, url: DETAIL_PAGE, fresh: true });
  await nav.handleNavigation(deps, { tabId: 2, url: DETAIL_PAGE + "?from=warning#top" });
  await activate(2);

  assert.equal(patches.length, shown, "the current site is left as it was");
  assert.deepEqual(browser.calls, []);
  assert.deepEqual(verdictRequests(backend), [WARNED]);
});

test("focusing another window republishes the state of its active tab", async () => {
  const { backend, deps, browser, patches } = await setup({ 1: WARNED, 2: "chrome://newtab/" });
  await nav.handleNavigation(deps, { tabId: 1, url: WARNED, fresh: true });

  browser.active = 2;
  await nav.handleWindowFocused(deps, { windowId: 7 });
  assert.deepEqual(last(patches), NOT_EVALUATED);

  browser.active = 1;
  await nav.handleWindowFocused(deps, { windowId: 3 });
  assert.equal(last(patches).currentSite.status, "advertencia");
  assert.deepEqual(verdictRequests(backend), [WARNED]);

  /* No browser window has the focus: nothing to describe. */
  const before = patches.length;
  await nav.handleWindowFocused(deps, { windowId: -1 });
  await nav.handleWindowFocused(deps, {});
  browser.active = null;
  await nav.handleWindowFocused(deps, { windowId: 3 });
  browser.getActiveTabId = async () => {
    throw new Error("no windows");
  };
  await nav.handleWindowFocused(deps, { windowId: 3 });
  assert.equal(patches.length, before);
});

"use strict";

/* Navigation use case against the backend stand-in: the domain policy in
   force is applied every time a tab commits a navigation, also when it reloads
   a url it already evaluated. The tab events are the ones Chrome fires, mapped
   with fromTabUpdate exactly as the service worker does. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { createRestFake } = require("./rest-fake");

const Sereno = load(
  "time/domain/time.js",
  "platform/providers/remote.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "verdict/application/verdict-service.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "verdict/ui/verdict-modal.js",
  "verdict/ui/page-overlay.js",
  "protection/application/navigation-service.js"
);

const nav = Sereno.navigationService;
const BASE_URL = "https://api.sereno.test";
const DOMAIN = "paypal-secure-login.com";
const URL_A = "https://" + DOMAIN + "/login";
const TAB = 1;

function fakeBrowser() {
  const records = new Map();
  const calls = [];
  return {
    calls,
    records,
    async setBadge(tabId, text, color) {
      calls.push({ op: "badge", tabId, text, color });
    },
    async notifyTab(tabId, message) {
      calls.push({ op: "notify", tabId, message });
    },
    async getActiveTabId() {
      return TAB;
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

/* A clock that moves: every reading is one second later than the previous. */
function tickingClock() {
  let ms = new Date(2026, 10, 13, 10, 0, 0).getTime();
  return () => {
    ms += 1000;
    return new Date(ms);
  };
}

function setup() {
  const backend = createRestFake({ baseUrl: BASE_URL });
  const patches = [];
  const deps = {
    services: Sereno.providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 500, fetch: backend }),
    store: {
      async set(patch) {
        patches.push(patch);
      }
    },
    browser: fakeBrowser(),
    now: tickingClock(),
    options: { pendingAfterMs: 5000 }
  };
  return { backend, deps, patches };
}

/* One chrome.tabs.onUpdated event, handled like background/service-worker.js. */
async function tabUpdated(deps, changeInfo, tab) {
  const navigation = nav.fromTabUpdate(TAB, changeInfo, tab);
  return navigation ? nav.handleNavigation(deps, navigation) : undefined;
}

async function firstVisit(deps, url) {
  await tabUpdated(deps, { status: "loading", url }, { id: TAB, url });
  await tabUpdated(deps, { status: "complete" }, { id: TAB, url });
}

/* A reload keeps the url, so Chrome reports the status alone. */
async function reload(deps, url) {
  await tabUpdated(deps, { status: "loading" }, { id: TAB, url });
  await tabUpdated(deps, { status: "complete" }, { id: TAB, url });
}

function setPolicy(backend, policy) {
  backend.state.domains.find((row) => row.domain === DOMAIN).policy = policy;
}

const verdictRequests = (backend) => backend.calls.filter((call) => call.path === "/v1/verdict").length;
const messagesOf = (deps) => deps.browser.calls.filter((call) => call.op === "notify").map((call) => call.message);
const lastMessage = (deps) => messagesOf(deps).pop();
const lastBadge = (deps) => deps.browser.calls.filter((call) => call.op === "badge").pop();
const continuePast = (deps, url) => nav.handleMessage(deps, { type: "sereno:continue", url }, { tab: { id: TAB, url } });

/* What the content script would draw for the messages it received: the number
   of times something was rendered and the status left on screen. */
function overlayAfter(messages) {
  let state = { id: null, dismissed: false };
  let renders = 0;
  let shown = null;
  messages.forEach((message) => {
    const decision = Sereno.pageOverlay.decide(state, message.outcome, message.acknowledged === true);
    state = decision.next;
    if (decision.action === "render") {
      renders += 1;
      shown = decision.plan.status;
    } else if (decision.action === "clear") {
      shown = null;
    }
  });
  return { renders, shown };
}

test("a reload applies the policy the administrator set after the first evaluation", async () => {
  const { backend, deps, patches } = setup();
  await firstVisit(deps, URL_A);
  assert.equal(lastMessage(deps).outcome.verdict.status, "advertencia");
  assert.equal(verdictRequests(backend), 1);

  setPolicy(backend, "bloqueo");
  await reload(deps, URL_A);

  assert.equal(verdictRequests(backend), 2);
  assert.equal(lastMessage(deps).outcome.verdict.status, "bloqueo");
  assert.equal(lastMessage(deps).acknowledged, undefined);
  assert.equal(deps.browser.records.get(TAB).outcome.verdict.status, "bloqueo");
  assert.equal(lastBadge(deps).text, "✕");
  assert.equal(patches[patches.length - 1].currentSite.status, "bloqueo");
  assert.deepEqual(overlayAfter(messagesOf(deps)), { renders: 2, shown: "bloqueo" });
});

test("a reload also relaxes a block that was changed back to a warning", async () => {
  const { backend, deps } = setup();
  setPolicy(backend, "bloqueo");
  await firstVisit(deps, URL_A);
  assert.equal(lastMessage(deps).outcome.verdict.status, "bloqueo");

  setPolicy(backend, "advertencia");
  await reload(deps, URL_A);
  assert.equal(lastMessage(deps).outcome.verdict.status, "advertencia");
  assert.equal(verdictRequests(backend), 2);
});

test("after continuing, a reload asks again and still does not warn", async () => {
  const { backend, deps } = setup();
  await firstVisit(deps, URL_A);
  assert.deepEqual(await continuePast(deps, URL_A), { ok: true });
  deps.browser.calls.length = 0;

  await reload(deps, URL_A);

  assert.equal(verdictRequests(backend), 2);
  assert.ok(messagesOf(deps).length > 0);
  messagesOf(deps).forEach((message) => {
    assert.equal(message.outcome.verdict.status, "advertencia");
    assert.equal(message.acknowledged, true);
  });
  assert.deepEqual(overlayAfter(messagesOf(deps)), { renders: 0, shown: null });
  assert.deepEqual(deps.browser.records.get(TAB).continued, ["https://" + DOMAIN]);
});

test("after continuing, a reload under a block policy shows the block", async () => {
  const { backend, deps } = setup();
  await firstVisit(deps, URL_A);
  assert.deepEqual(await continuePast(deps, URL_A), { ok: true });
  deps.browser.calls.length = 0;

  setPolicy(backend, "bloqueo");
  await reload(deps, URL_A);

  assert.equal(verdictRequests(backend), 2);
  messagesOf(deps).forEach((message) => {
    assert.equal(message.outcome.verdict.status, "bloqueo");
    assert.equal(message.acknowledged, undefined);
  });
  assert.deepEqual(overlayAfter(messagesOf(deps)), { renders: 1, shown: "bloqueo" });
  assert.deepEqual(await continuePast(deps, URL_A), { ok: false, error: "blocked" });
  const reply = await nav.handleMessage(deps, { type: "sereno:get-outcome" }, { tab: { id: TAB, url: URL_A } });
  assert.equal(reply.outcome.verdict.status, "bloqueo");
  assert.equal(reply.acknowledged, undefined);
});

test("the repeated events of one navigation cause one request and one render", async () => {
  const { backend, deps } = setup();
  /* Chrome may report the load twice: when the tab starts loading and when the
     navigation commits. Then the page completes and the tab is activated. */
  await tabUpdated(deps, { status: "loading", url: URL_A }, { id: TAB, url: URL_A });
  await tabUpdated(deps, { status: "loading" }, { id: TAB, url: URL_A });
  await tabUpdated(deps, { title: "Login" }, { id: TAB, url: URL_A });
  await tabUpdated(deps, { status: "complete" }, { id: TAB, url: URL_A });
  await nav.handleTabActivated(deps, { tabId: TAB });
  await nav.handleTabActivated(deps, { tabId: TAB });

  assert.equal(verdictRequests(backend), 1);
  assert.deepEqual(overlayAfter(messagesOf(deps)), { renders: 1, shown: "advertencia" });

  /* The same holds for the events of one reload. */
  await tabUpdated(deps, { status: "loading" }, { id: TAB, url: URL_A });
  await tabUpdated(deps, { status: "loading", url: URL_A }, { id: TAB, url: URL_A });
  await tabUpdated(deps, { status: "complete" }, { id: TAB, url: URL_A });
  await nav.handleTabActivated(deps, { tabId: TAB });

  assert.equal(verdictRequests(backend), 2);
  assert.deepEqual(overlayAfter(messagesOf(deps)), { renders: 1, shown: "advertencia" });
});

test("a tab that is not reloaded keeps its outcome when the policy changes", async () => {
  const { backend, deps } = setup();
  await firstVisit(deps, URL_A);
  setPolicy(backend, "bloqueo");

  await tabUpdated(deps, { status: "complete" }, { id: TAB, url: URL_A });
  await nav.handleTabActivated(deps, { tabId: TAB });

  assert.equal(verdictRequests(backend), 1);
  assert.equal(lastMessage(deps).outcome.verdict.status, "advertencia");
});

test("a reload while the same url is still being evaluated does not ask twice", async () => {
  const { backend, deps } = setup();
  const slow = Object.assign({}, deps, {
    services: {
      verdict: {
        async evaluate(url) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return deps.services.verdict.evaluate(url);
        }
      }
    }
  });
  const first = tabUpdated(slow, { status: "loading", url: URL_A }, { id: TAB, url: URL_A });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await tabUpdated(slow, { status: "loading" }, { id: TAB, url: URL_A }), null);
  assert.equal((await first).verdict.status, "advertencia");
  assert.equal(verdictRequests(backend), 1);
});

test("the start of a navigation to another url does not evaluate the page being left", async () => {
  const { backend, deps } = setup();
  await firstVisit(deps, URL_A);
  const next = "https://tienda-servicios.pe/";

  /* Before the commit the tab still reports the old url and the pending one. */
  await tabUpdated(deps, { status: "loading" }, { id: TAB, url: URL_A, pendingUrl: next });
  assert.equal(verdictRequests(backend), 1);

  await tabUpdated(deps, { status: "loading", url: next }, { id: TAB, url: next });
  await tabUpdated(deps, { status: "complete" }, { id: TAB, url: next });
  assert.equal(verdictRequests(backend), 2);
  assert.equal(lastMessage(deps).outcome.verdict.status, "seguro");
});

test("a loading event is a new navigation; complete only repeats it", () => {
  assert.deepEqual(nav.fromTabUpdate(3, { status: "loading", url: "https://a.pe/" }, { url: "https://a.pe/" }), { tabId: 3, url: "https://a.pe/", fresh: true });
  assert.deepEqual(nav.fromTabUpdate(3, { status: "loading" }, { url: "https://a.pe/" }), { tabId: 3, url: "https://a.pe/", fresh: true });
  assert.deepEqual(nav.fromTabUpdate(3, { status: "loading" }, { url: "https://a.pe/", pendingUrl: "https://a.pe/" }), { tabId: 3, url: "https://a.pe/", fresh: true });
  assert.equal(nav.fromTabUpdate(3, { status: "loading" }, { url: "https://a.pe/", pendingUrl: "https://b.pe/" }), null);
  assert.equal(nav.fromTabUpdate(3, { status: "loading" }, {}), null);
  assert.equal(nav.fromTabUpdate(3, { status: "loading" }, undefined), null);
  assert.deepEqual(nav.fromTabUpdate(3, { status: "complete" }, { url: "https://a.pe/x" }), { tabId: 3, url: "https://a.pe/x" });
});

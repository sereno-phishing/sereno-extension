"use strict";

/* Pages served by the backend the extension talks to are never evaluated: no
   verdict request, no overlay, no badge and no history entry. Only that exact
   origin (scheme, host and port) is exempt; other loopback or private
   addresses are evaluated like any site. */

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
const BASE_URL = "http://127.0.0.1:5000";
const OWN_PAGE = BASE_URL + "/dev/users";
const WARNED = "https://paypal-secure-login.com/login";
const NOW = new Date(2026, 10, 13, 10, 0, 0);
const NOT_EVALUATED = { currentSite: { kind: "not_evaluated" } };

const SAME_ORIGIN = [BASE_URL, BASE_URL + "/", OWN_PAGE, BASE_URL + "/dev/users?page=2#top", "HTTP://127.0.0.1:5000/v1/model"];
const OTHER_PORT = ["http://127.0.0.1:5001/dev/users", "http://127.0.0.1/dev/users", "http://127.0.0.1:50000/"];
const LOOKALIKE = [
  "http://127.0.0.1.5000.evil.pe/dev/users",
  "http://127.0.0.1.evil.pe:5000/dev/users",
  "http://127.0.0.1:5000@evil.pe/dev/users",
  "http://evil.pe/http://127.0.0.1:5000/dev/users",
  "http://evil.pe/?next=http://127.0.0.1:5000/"
];
const OTHER_HOST = ["https://127.0.0.1:5000/dev/users", "http://localhost:5000/dev/users", "http://127.0.0.2:5000/", "http://192.168.1.10:5000/", "http://[::1]:5000/"];

function remote(baseUrl, fetch) {
  return Sereno.providers.remote.create({ baseUrl, timeoutMs: 500, fetch: fetch || (async () => ({ ok: true, status: 200, json: async () => ({}) })) });
}

test("the verdict port recognises the pages of its own backend by origin", () => {
  const port = remote(BASE_URL).verdict;
  SAME_ORIGIN.forEach((url) => assert.equal(port.isOwnPage(url), true, url));
  OTHER_PORT.concat(LOOKALIKE, OTHER_HOST).forEach((url) => assert.equal(port.isOwnPage(url), false, url));
  [undefined, null, "", "not a url", "about:blank", "/dev/users", 5000, "http://127.0.0.1:5000.evil.pe/dev/users"].forEach((value) => assert.equal(port.isOwnPage(value), false, String(value)));
});

test("the origin is compared, whatever the way the backend address is written", () => {
  const port = remote("https://api.sereno.test/").verdict;
  assert.equal(port.isOwnPage("https://api.sereno.test/docs"), true);
  assert.equal(port.isOwnPage("https://api.sereno.test:443/docs"), true);
  assert.equal(port.isOwnPage("https://api.sereno.test:8443/docs"), false);
  assert.equal(port.isOwnPage("http://api.sereno.test/docs"), false);
  assert.equal(port.isOwnPage("https://api.sereno.test.evil.pe/docs"), false);

  ["", undefined, "not a url", "/relative"].forEach((baseUrl) => {
    assert.equal(remote(baseUrl).verdict.isOwnPage("http://127.0.0.1:5000/"), false, String(baseUrl));
    assert.equal(remote(baseUrl).verdict.isOwnPage("about:blank"), false, String(baseUrl));
  });
  assert.ok(Sereno.providers.ports.METHODS.verdict.includes("isOwnPage"));
});

function fakeBrowser(active) {
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
      return active === undefined ? 1 : active;
    },
    async getTabUrl() {
      return OWN_PAGE;
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

async function setup(options) {
  const settings = options || {};
  const backend = createRestFake({ baseUrl: BASE_URL, now: () => NOW });
  const services = remote(BASE_URL, backend);
  if (settings.signedIn) {
    await backend(BASE_URL + "/v1/auth/login", { method: "POST", body: JSON.stringify({ username: "andres.torres", password: "sereno123" }) });
    backend.calls.length = 0;
  }
  const patches = [];
  const deps = {
    services,
    store: {
      async set(patch) {
        patches.push(patch);
      }
    },
    browser: fakeBrowser(settings.active),
    now: () => NOW,
    options: { pendingAfterMs: 5000 }
  };
  return { backend, deps, patches };
}

const verdictRequests = (backend) => backend.calls.filter((call) => call.path === "/v1/verdict").map((call) => call.body.url);
const messagesOf = (deps) => deps.browser.calls.filter((call) => call.op === "notify");
const paintedBadges = (deps) => deps.browser.calls.filter((call) => call.op === "badge" && call.text !== "");
const fromTab = (url) => ({ tab: { id: 1, url } });

test("a page of the backend origin gets no request, no overlay, no badge and no history entry", async () => {
  const { backend, deps, patches } = await setup({ signedIn: true });
  const historyBefore = JSON.stringify(backend.state.history);

  for (const url of SAME_ORIGIN) {
    assert.equal(await nav.handleNavigation(deps, { tabId: 1, url, fresh: true }), null, url);
    assert.equal(await nav.handleNavigation(deps, { tabId: 1, url }), null, url);
  }

  assert.deepEqual(backend.calls, []);
  assert.deepEqual(messagesOf(deps), []);
  assert.deepEqual(paintedBadges(deps), []);
  assert.equal(JSON.stringify(backend.state.history), historyBefore);
  assert.equal(deps.browser.records.size, 0);
  assert.deepEqual(await nav.handleMessage(deps, { type: "sereno:get-outcome" }, fromTab(OWN_PAGE)), { ok: true, outcome: null });
  /* The popup shows the card of a page that is not evaluated. */
  assert.ok(patches.length > 0);
  patches.forEach((patch) => assert.deepEqual(patch, NOT_EVALUATED));
});

test("another port, another scheme, another loopback address or a lookalike host is evaluated", async () => {
  for (const url of OTHER_PORT.concat(LOOKALIKE, OTHER_HOST)) {
    const { backend, deps } = await setup();
    const outcome = await nav.handleNavigation(deps, { tabId: 1, url, fresh: true });
    assert.equal(outcome && outcome.kind, "verdict", url);
    assert.deepEqual(verdictRequests(backend), [url]);
    assert.equal(paintedBadges(deps).length, 1, url);
  }
});

test("going from an evaluated site to a backend page clears that tab's verdict", async () => {
  const { backend, deps, patches } = await setup();
  await nav.handleNavigation(deps, { tabId: 1, url: WARNED, fresh: true });
  assert.equal(deps.browser.records.get(1).outcome.verdict.status, "advertencia");
  assert.deepEqual(await nav.handleMessage(deps, { type: "sereno:continue", url: WARNED }, fromTab(WARNED)), { ok: true });
  deps.browser.calls.length = 0;

  assert.equal(await nav.handleNavigation(deps, { tabId: 1, url: OWN_PAGE, fresh: true }), null);
  assert.equal(await nav.handleNavigation(deps, { tabId: 1, url: OWN_PAGE }), null);

  assert.deepEqual(verdictRequests(backend), [WARNED]);
  assert.deepEqual(messagesOf(deps), []);
  assert.deepEqual(paintedBadges(deps), []);
  assert.ok(deps.browser.calls.some((call) => call.op === "badge" && call.tabId === 1 && call.text === ""), "the badge of the previous page is cleared");
  assert.deepEqual(await nav.handleMessage(deps, { type: "sereno:get-outcome" }, fromTab(OWN_PAGE)), { ok: true, outcome: null });
  assert.equal((await nav.handleMessage(deps, { type: "sereno:continue", url: OWN_PAGE }, fromTab(OWN_PAGE))).ok, false);
  assert.deepEqual(patches[patches.length - 1], NOT_EVALUATED);

  /* What the user chose on the other origin is still remembered in the tab. */
  await nav.handleNavigation(deps, { tabId: 1, url: WARNED, fresh: true });
  assert.equal(messagesOf(deps).pop().message.acknowledged, true);
});

test("an evaluation still running for the previous page is not shown on a backend page", async () => {
  const { backend, deps } = await setup();
  const slow = Object.assign({}, deps, {
    services: {
      verdict: {
        isOwnPage: deps.services.verdict.isOwnPage,
        async evaluate(url) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return deps.services.verdict.evaluate(url);
        }
      }
    }
  });
  const running = nav.handleNavigation(slow, { tabId: 1, url: WARNED, fresh: true });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await nav.handleNavigation(slow, { tabId: 1, url: OWN_PAGE, fresh: true }), null);
  assert.equal(await running, null);

  assert.deepEqual(verdictRequests(backend), [WARNED]);
  assert.deepEqual(messagesOf(deps), []);
  assert.deepEqual(paintedBadges(deps), []);
  assert.deepEqual(await nav.handleMessage(deps, { type: "sereno:get-outcome" }, fromTab(OWN_PAGE)), { ok: true, outcome: null });
});

test("a backend page in a background tab does not touch the popup state", async () => {
  const { backend, deps, patches } = await setup({ active: 9 });
  await nav.handleNavigation(deps, { tabId: 1, url: OWN_PAGE, fresh: true });
  assert.deepEqual(patches, []);
  assert.deepEqual(backend.calls, []);
});

test("activating a tab that shows a backend page publishes the not-evaluated site without a request", async () => {
  const { backend, deps, patches } = await setup();
  await nav.handleTabActivated(deps, { tabId: 1 });
  assert.deepEqual(backend.calls, []);
  assert.deepEqual(messagesOf(deps), []);
  assert.deepEqual(paintedBadges(deps), []);
  assert.deepEqual(patches, [NOT_EVALUATED]);

  /* Also when the tab keeps a record because the user continued elsewhere. */
  const kept = await setup();
  await nav.handleNavigation(kept.deps, { tabId: 1, url: WARNED, fresh: true });
  await nav.handleMessage(kept.deps, { type: "sereno:continue", url: WARNED }, fromTab(WARNED));
  await nav.handleNavigation(kept.deps, { tabId: 1, url: OWN_PAGE, fresh: true });
  kept.patches.length = 0;
  await nav.handleTabActivated(kept.deps, { tabId: 1 });
  assert.deepEqual(kept.patches, [NOT_EVALUATED]);
  assert.deepEqual(verdictRequests(kept.backend), [WARNED]);
});

test("services without the predicate keep evaluating every web page", async () => {
  const asked = [];
  const deps = {
    services: { verdict: { async evaluate(url) { asked.push(url); return { ok: true, domain: "127.0.0.1", verdict: "legitima", policy: "advertencia", score: 0.1, source: "modelo", latencyMs: 5 }; } } },
    store: { async set() {} },
    browser: fakeBrowser(),
    now: () => NOW
  };
  assert.equal((await nav.handleNavigation(deps, { tabId: 1, url: OWN_PAGE })).kind, "verdict");
  assert.deepEqual(asked, [OWN_PAGE]);

  const throwing = Object.assign({}, deps, { services: { verdict: { evaluate: deps.services.verdict.evaluate, isOwnPage() { throw new Error("boom"); } } } });
  assert.equal((await nav.handleNavigation(throwing, { tabId: 2, url: OWN_PAGE })).kind, "verdict");
});

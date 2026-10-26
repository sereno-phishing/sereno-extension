"use strict";

/* Navigation use case: a real http(s) navigation becomes a verdict, a tab
   badge, a popup-visible site and a message for the content script. Runs with
   fake services, store and browser port; nothing here touches chrome.*. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "verdict/application/verdict-service.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "protection/application/navigation-service.js"
);

const nav = Sereno.navigationService;
const NOW = new Date(2026, 9, 25, 10, 30, 0);

function verdictResult(status, domain) {
  return { ok: true, domain: domain || "tienda.pe", status, score: 0.5, source: "modelo", latencyMs: 10 };
}

/* services.verdict.evaluate answers by url from a table; a function value can
   delay or throw. */
function fakeServices(table, delayMs) {
  const asked = [];
  return {
    asked,
    verdict: {
      async evaluate(url) {
        asked.push(url);
        const answer = typeof table === "function" ? table(url) : table[url];
        if (delayMs && delayMs[url]) {
          await new Promise((resolve) => setTimeout(resolve, delayMs[url]));
        }
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      }
    }
  };
}

function fakeBrowser(options) {
  const settings = options || {};
  const records = new Map();
  const calls = [];
  const port = {
    calls,
    records,
    async setBadge(tabId, text, color) {
      calls.push({ op: "badge", tabId, text, color });
      if (settings.badgeFails) {
        throw new Error("No tab with id");
      }
    },
    async notifyTab(tabId, message) {
      calls.push({ op: "notify", tabId, message });
      if (settings.notifyFails) {
        throw new Error("boom");
      }
    },
    async getActiveTabId() {
      if (settings.activeFails) {
        throw new Error("no windows");
      }
      return settings.active === undefined ? null : settings.active;
    },
    async loadTabRecord(tabId) {
      return records.has(tabId) ? JSON.parse(JSON.stringify(records.get(tabId))) : null;
    },
    async saveTabRecord(tabId, record) {
      if (settings.recordFails) {
        throw new Error("quota");
      }
      records.set(tabId, JSON.parse(JSON.stringify(record)));
    },
    async removeTabRecord(tabId) {
      records.delete(tabId);
    }
  };
  return port;
}

function fakeStore(fails) {
  const patches = [];
  return {
    patches,
    async set(patch) {
      if (fails) {
        throw new Error("storage down");
      }
      patches.push(patch);
    }
  };
}

function makeDeps(parts) {
  return Object.assign(
    {
      services: fakeServices({}),
      store: fakeStore(),
      browser: fakeBrowser(),
      now: () => NOW,
      options: { pendingAfterMs: 5000 }
    },
    parts
  );
}

const badgesOf = (browser) => browser.calls.filter((call) => call.op === "badge");
const messagesOf = (browser) => browser.calls.filter((call) => call.op === "notify");

test("only http and https pages are evaluated", async () => {
  const urls = ["", undefined, null, "about:blank", "chrome://newtab/", "chrome-extension://abc/app/popup/popup.html", "file:///c:/a.html", "ftp://x.pe/", "javascript:alert(1)", "not a url"];
  urls.forEach((url) => assert.equal(nav.isEvaluable(url), false, String(url)));
  assert.equal(nav.isEvaluable("http://tienda.pe/"), true);
  assert.equal(nav.isEvaluable("https://tienda.pe/pago?x=1"), true);

  const deps = makeDeps();
  for (const url of urls) {
    assert.equal(await nav.handleNavigation(deps, { tabId: 1, url }), null);
  }
  assert.equal(await nav.handleNavigation(deps, { tabId: undefined, url: "https://a.pe/" }), null);
  assert.deepEqual(deps.services.asked, []);
  assert.deepEqual(deps.browser.calls, []);
  assert.equal(deps.browser.records.size, 0);
});

test("badge per outcome: safe, warning, block", async () => {
  const cases = [
    ["seguro", "✓", "#16A34A"],
    ["advertencia", "!", "#D97706"],
    ["bloqueo", "✕", "#DC2626"]
  ];
  for (const [status, text, color] of cases) {
    const deps = makeDeps({ services: fakeServices({ "https://a.pe/": verdictResult(status, "a.pe") }) });
    const outcome = await nav.handleNavigation(deps, { tabId: 7, url: "https://a.pe/" });
    assert.equal(outcome.kind, "verdict");
    assert.equal(outcome.verdict.status, status);
    assert.deepEqual(badgesOf(deps.browser), [{ op: "badge", tabId: 7, text, color }]);
    assert.deepEqual(messagesOf(deps.browser), [{ op: "notify", tabId: 7, message: { type: "sereno:outcome", outcome } }]);
  }
});

test("a slow verdict paints the pending badge first and sends the pending outcome", async () => {
  const deps = makeDeps({
    services: fakeServices({ "https://slow.pe/": verdictResult("advertencia", "slow.pe") }, { "https://slow.pe/": 60 }),
    options: { pendingAfterMs: 5 },
    browser: fakeBrowser({ active: 3 })
  });
  const outcome = await nav.handleNavigation(deps, { tabId: 3, url: "https://slow.pe/" });
  assert.equal(outcome.kind, "verdict");
  assert.deepEqual(
    badgesOf(deps.browser).map((call) => call.text),
    ["…", "!"]
  );
  assert.deepEqual(
    messagesOf(deps.browser).map((call) => call.message.outcome.kind),
    ["pending", "verdict"]
  );
  assert.equal(deps.store.patches[0].currentSite.status, "evaluando");
  assert.equal(deps.store.patches[1].currentSite.status, "advertencia");
  /* the stored record keeps only the final outcome */
  assert.equal(deps.browser.records.get(3).outcome.kind, "verdict");
});

test("provider failures are degraded, fail open and mark the protection level", async () => {
  const cases = [
    [{ ok: false, error: "offline" }, "offline"],
    [{ ok: false, error: "timeout" }, "timeout"],
    [new Error("boom"), "server"],
    [undefined, "server"]
  ];
  for (const [answer, reason] of cases) {
    const deps = makeDeps({ services: fakeServices({ "https://a.pe/": answer }), browser: fakeBrowser({ active: 1 }) });
    const outcome = await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
    assert.deepEqual(outcome, { kind: "degraded", reason });
    assert.deepEqual(badgesOf(deps.browser), [{ op: "badge", tabId: 1, text: "?", color: "#D97706" }]);
    assert.equal(deps.store.patches[0].protectionLevel, "degraded");
    assert.equal(Sereno.verdictOutcome.blocksNavigation(outcome), false);
    assert.equal(messagesOf(deps.browser)[0].message.outcome.kind, "degraded");
  }
});

test("the active tab publishes the site and protection level for the popup", async () => {
  const deps = makeDeps({
    services: fakeServices({ "https://www.paypal-secure-login.com/x": verdictResult("advertencia", "paypal-secure-login.com") }),
    browser: fakeBrowser({ active: 4 })
  });
  await nav.handleNavigation(deps, { tabId: 4, url: "https://www.paypal-secure-login.com/x" });
  assert.equal(deps.store.patches.length, 1);
  const patch = deps.store.patches[0];
  assert.equal(patch.protectionLevel, "active");
  assert.equal(patch.currentSite.domain, "paypal-secure-login.com");
  assert.equal(patch.currentSite.status, "advertencia");
  assert.equal(patch.currentSite.ts, Sereno.time.stamp(NOW));
});

test("a background tab paints its own badge but does not touch the popup state", async () => {
  const deps = makeDeps({
    services: fakeServices({ "https://bg.pe/": verdictResult("bloqueo", "bg.pe") }),
    browser: fakeBrowser({ active: 99 })
  });
  await nav.handleNavigation(deps, { tabId: 5, url: "https://bg.pe/" });
  assert.deepEqual(deps.store.patches, []);
  assert.equal(badgesOf(deps.browser)[0].tabId, 5);
  assert.equal(deps.browser.records.get(5).outcome.verdict.status, "bloqueo");
});

test("each tab keeps its own stored outcome", async () => {
  const deps = makeDeps({
    services: fakeServices({ "https://a.pe/": verdictResult("seguro", "a.pe"), "https://b.pe/": verdictResult("bloqueo", "b.pe") })
  });
  await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  await nav.handleNavigation(deps, { tabId: 2, url: "https://b.pe/" });
  assert.equal(deps.browser.records.get(1).url, "https://a.pe/");
  assert.equal(deps.browser.records.get(1).outcome.verdict.status, "seguro");
  assert.equal(deps.browser.records.get(2).outcome.verdict.status, "bloqueo");
});

test("a newer navigation on the same tab wins over a slower earlier one", async () => {
  const deps = makeDeps({
    services: fakeServices(
      { "https://old.pe/": verdictResult("bloqueo", "old.pe"), "https://new.pe/": verdictResult("seguro", "new.pe") },
      { "https://old.pe/": 80 }
    ),
    browser: fakeBrowser({ active: 1 })
  });
  const first = nav.handleNavigation(deps, { tabId: 1, url: "https://old.pe/" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await nav.handleNavigation(deps, { tabId: 1, url: "https://new.pe/" });
  const stale = await first;

  assert.equal(second.verdict.status, "seguro");
  assert.equal(stale, null);
  assert.equal(deps.browser.records.get(1).url, "https://new.pe/");
  assert.deepEqual(
    badgesOf(deps.browser).map((call) => call.text),
    ["✓"]
  );
  assert.equal(messagesOf(deps.browser).length, 1);
  assert.deepEqual(
    deps.store.patches.map((patch) => patch.currentSite.domain),
    ["new.pe"]
  );
});

test("the same url on the same tab is not evaluated twice, but is shown again", async () => {
  const deps = makeDeps({ services: fakeServices({ "https://a.pe/": verdictResult("advertencia", "a.pe") }) });
  const first = await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  const again = await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  assert.deepEqual(again, first);
  assert.deepEqual(deps.services.asked, ["https://a.pe/"]);
  assert.equal(badgesOf(deps.browser).length, 2);
  assert.equal(messagesOf(deps.browser).length, 2);
});

test("an evaluation already running for the same url is not started again", async () => {
  const deps = makeDeps({ services: fakeServices({ "https://a.pe/": verdictResult("seguro", "a.pe") }, { "https://a.pe/": 40 }) });
  const first = nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" }), null);
  assert.equal((await first).kind, "verdict");
  assert.equal(deps.services.asked.length, 1);
});

test("activating a tab republishes its stored outcome without showing the modal again", async () => {
  const deps = makeDeps({
    services: fakeServices({ "https://a.pe/": verdictResult("bloqueo", "a.pe") }),
    browser: fakeBrowser({ active: 2 })
  });
  await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  deps.browser.calls.length = 0;
  deps.store.patches.length = 0;

  await nav.handleTabActivated(deps, { tabId: 1 });
  assert.deepEqual(badgesOf(deps.browser), [{ op: "badge", tabId: 1, text: "✕", color: "#DC2626" }]);
  assert.deepEqual(messagesOf(deps.browser), []);
  assert.equal(deps.store.patches[0].currentSite.status, "bloqueo");
  assert.equal(deps.store.patches[0].protectionLevel, "active");

  deps.browser.calls.length = 0;
  deps.store.patches.length = 0;
  await nav.handleTabActivated(deps, { tabId: 404 });
  assert.deepEqual(deps.browser.calls, []);
  assert.deepEqual(deps.store.patches, []);
});

test("closing a tab drops its stored outcome", async () => {
  const deps = makeDeps({ services: fakeServices({ "https://a.pe/": verdictResult("seguro", "a.pe") }) });
  await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  assert.equal(deps.browser.records.has(1), true);
  await nav.handleTabRemoved(deps, { tabId: 1 });
  assert.equal(deps.browser.records.has(1), false);
  await nav.handleTabRemoved(deps, { tabId: 1 });
});

test("tab update events map to a navigation only when the url is real", () => {
  assert.deepEqual(nav.fromTabUpdate(3, { status: "loading", url: "https://a.pe/" }, { url: "https://a.pe/" }), { tabId: 3, url: "https://a.pe/" });
  assert.deepEqual(nav.fromTabUpdate(3, { status: "complete" }, { url: "https://a.pe/x" }), { tabId: 3, url: "https://a.pe/x" });
  assert.equal(nav.fromTabUpdate(3, { status: "loading" }, { url: "https://a.pe/" }), null);
  assert.equal(nav.fromTabUpdate(3, { title: "x" }, { url: "https://a.pe/" }), null);
  assert.equal(nav.fromTabUpdate(3, { status: "complete" }, {}), null);
  assert.equal(nav.fromTabUpdate(3, { status: "complete" }, undefined), null);
  assert.equal(nav.fromTabUpdate(3, undefined, undefined), null);
});

test("nothing throws when the provider, browser or store fail", async () => {
  const url = "https://a.pe/";
  const scenarios = {
    badge: { browser: fakeBrowser({ active: 1, badgeFails: true }) },
    notify: { browser: fakeBrowser({ active: 1, notifyFails: true }) },
    active: { browser: fakeBrowser({ activeFails: true }) },
    records: { browser: fakeBrowser({ active: 1, recordFails: true }) },
    store: { browser: fakeBrowser({ active: 1 }), store: fakeStore(true) },
    services: { browser: fakeBrowser({ active: 1 }), services: { verdict: { evaluate: () => { throw new Error("sync boom"); } } } },
    empty: { services: {} }
  };
  for (const [name, parts] of Object.entries(scenarios)) {
    const deps = makeDeps(Object.assign({ services: fakeServices({ [url]: verdictResult("seguro", "a.pe") }) }, parts));
    await assert.doesNotReject(nav.handleNavigation(deps, { tabId: 1, url }), name);
    await assert.doesNotReject(nav.handleTabActivated(deps, { tabId: 1 }), name);
    await assert.doesNotReject(nav.handleTabRemoved(deps, { tabId: 1 }), name);
  }
  await assert.doesNotReject(nav.handleNavigation(undefined, { tabId: 1, url }));
  await assert.doesNotReject(nav.handleNavigation({}, undefined));
  await assert.doesNotReject(nav.handleTabActivated({}, undefined));
  await assert.doesNotReject(nav.handleTabRemoved(undefined, undefined));
});

test("a broken provider still yields a fail-open degraded outcome on the tab", async () => {
  const deps = makeDeps({
    browser: fakeBrowser({ active: 1 }),
    services: { verdict: { evaluate: () => { throw new Error("sync boom"); } } }
  });
  const outcome = await nav.handleNavigation(deps, { tabId: 1, url: "https://a.pe/" });
  assert.equal(outcome.kind, "degraded");
  assert.equal(badgesOf(deps.browser)[0].text, "?");
});

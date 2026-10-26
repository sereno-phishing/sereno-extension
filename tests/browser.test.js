"use strict";

/* Browser adapter for real tabs: badge, tab messages, active tab and the
   per-tab records kept in chrome.storage.session. chrome is a fake. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

function installChrome(overrides) {
  const calls = [];
  const session = new Map();
  const fake = {
    action: {
      async setBadgeText(details) {
        calls.push(["text", details]);
      },
      async setBadgeBackgroundColor(details) {
        calls.push(["color", details]);
      }
    },
    tabs: {
      async sendMessage(tabId, message) {
        calls.push(["send", tabId, message]);
      },
      async query(filter) {
        calls.push(["query", filter]);
        return [{ id: 12 }];
      }
    },
    storage: {
      session: {
        async get(key) {
          return session.has(key) ? { [key]: session.get(key) } : {};
        },
        async set(payload) {
          Object.entries(payload).forEach(([key, value]) => session.set(key, value));
        },
        async remove(key) {
          session.delete(key);
        }
      }
    }
  };
  globalThis.chrome = Object.assign(fake, overrides);
  return { calls, session };
}

const Sereno = load("platform/browser.js");

test.afterEach(() => {
  delete globalThis.chrome;
});

test("setBadge paints text and colour on the given real tab", async () => {
  const { calls } = installChrome();
  await Sereno.browser.setBadge(9, "✓", "#16A34A");
  assert.deepEqual(calls, [
    ["text", { tabId: 9, text: "✓" }],
    ["color", { tabId: 9, color: "#16A34A" }]
  ]);
});

test("notifyTab sends the message and swallows a missing receiver", async () => {
  const { calls } = installChrome();
  await Sereno.browser.notifyTab(4, { type: "sereno:outcome" });
  assert.deepEqual(calls, [["send", 4, { type: "sereno:outcome" }]]);

  installChrome({
    tabs: {
      async sendMessage() {
        throw new Error("Could not establish connection. Receiving end does not exist.");
      }
    }
  });
  await assert.doesNotReject(Sereno.browser.notifyTab(4, { type: "x" }));

  installChrome({
    tabs: {
      async sendMessage() {
        throw new Error("No tab with id: 4.");
      }
    }
  });
  await assert.rejects(Sereno.browser.notifyTab(4, { type: "x" }), /No tab with id/);
});

test("getActiveTabId reads the active tab of the focused window", async () => {
  const { calls } = installChrome();
  assert.equal(await Sereno.browser.getActiveTabId(), 12);
  assert.deepEqual(calls, [["query", { active: true, lastFocusedWindow: true }]]);

  installChrome({ tabs: { async query() { return []; } } });
  assert.equal(await Sereno.browser.getActiveTabId(), null);
});

test("tab records live in chrome.storage.session, one key per tab", async () => {
  const { session } = installChrome();
  assert.equal(await Sereno.browser.loadTabRecord(5), null);
  await Sereno.browser.saveTabRecord(5, { token: "t", url: "https://a.pe/" });
  assert.deepEqual([...session.keys()], ["sereno.tab.5"]);
  assert.deepEqual(await Sereno.browser.loadTabRecord(5), { token: "t", url: "https://a.pe/" });
  await Sereno.browser.removeTabRecord(5);
  assert.equal(await Sereno.browser.loadTabRecord(5), null);
});

test("outside the extension every real-tab call is a harmless no-op", async () => {
  delete globalThis.chrome;
  await assert.doesNotReject(Sereno.browser.setBadge(1, "✓", "#000"));
  await assert.doesNotReject(Sereno.browser.notifyTab(1, {}));
  assert.equal(await Sereno.browser.getActiveTabId(), null);
  assert.equal(await Sereno.browser.loadTabRecord(1), null);
  await assert.doesNotReject(Sereno.browser.saveTabRecord(1, {}));
  await assert.doesNotReject(Sereno.browser.removeTabRecord(1));
});

test("setTabBadge keeps painting the tab that hosts an extension page", async () => {
  const { calls } = installChrome({
    tabs: {
      async getCurrent() {
        return { id: 31 };
      }
    }
  });
  await Sereno.browser.setTabBadge({ text: "!", color: "#D97706" });
  assert.deepEqual(calls, [
    ["text", { tabId: 31, text: "!" }],
    ["color", { tabId: 31, color: "#D97706" }]
  ]);
});

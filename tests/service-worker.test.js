"use strict";

/* The MV3 service worker is a thin shell: it imports the scripts, registers
   its listeners synchronously and delegates to Sereno.navigationService. The
   fake importScripts really loads each script in Node, which also proves none
   of them touches window or document while loading. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const WORKER = path.join(ROOT, "background", "service-worker.js");

const imported = [];
const listeners = {};
const badges = [];
const messages = [];
const created = [];
const localData = {};
const sessionData = new Map();

function event(name) {
  return {
    addListener(fn) {
      listeners[name] = (listeners[name] || []).concat([fn]);
    }
  };
}

globalThis.importScripts = (...files) => {
  files.forEach((file) => {
    imported.push(file);
    require(path.resolve(ROOT, "background", file));
  });
};

globalThis.chrome = {
  action: {
    async setBadgeText(details) {
      badges.push(details);
    },
    async setBadgeBackgroundColor() {}
  },
  tabs: {
    onUpdated: event("onUpdated"),
    onActivated: event("onActivated"),
    onRemoved: event("onRemoved"),
    async create(details) {
      created.push(details);
    },
    async query() {
      return [{ id: 1 }];
    },
    async sendMessage(tabId, message) {
      messages.push({ tabId, message });
    }
  },
  runtime: {
    id: "abc",
    onMessage: event("runtime.onMessage"),
    getURL: (file) => "chrome-extension://abc/" + file
  },
  storage: {
    onChanged: event("storage.onChanged"),
    local: {
      get(key, callback) {
        callback(key in localData ? { [key]: JSON.parse(JSON.stringify(localData[key])) } : {});
      },
      set(payload, callback) {
        Object.assign(localData, JSON.parse(JSON.stringify(payload)));
        callback();
      }
    },
    session: {
      async get(key) {
        return sessionData.has(key) ? { [key]: sessionData.get(key) } : {};
      },
      async set(payload) {
        Object.entries(payload).forEach(([key, value]) => sessionData.set(key, value));
      },
      async remove(key) {
        sessionData.delete(key);
      }
    }
  }
};

/* No await between the require and the assertions: registration is synchronous. */
require(WORKER);
const registeredRightAway = {
  onUpdated: (listeners.onUpdated || []).length,
  onActivated: (listeners.onActivated || []).length,
  onRemoved: (listeners.onRemoved || []).length,
  onMessage: (listeners["runtime.onMessage"] || []).length
};

const source = fs.readFileSync(WORKER, "utf8");

test("the three tab listeners are registered synchronously at load", () => {
  assert.deepEqual(registeredRightAway, { onUpdated: 1, onActivated: 1, onRemoved: 1, onMessage: 1 });
  [/^chrome\.runtime\.onMessage\.addListener\(/m, /^chrome\.tabs\.onUpdated\.addListener\(/m, /^chrome\.tabs\.onActivated\.addListener\(/m, /^chrome\.tabs\.onRemoved\.addListener\(/m].forEach((pattern) => {
    assert.match(source, pattern);
  });
});

test("the worker imports its scripts first, in dependency order, with importScripts", () => {
  assert.ok(imported.length > 10);
  assert.ok(source.indexOf("importScripts(") < source.indexOf("addListener("));
  const position = (file) => imported.indexOf(file);
  assert.ok(position("../verdict/domain/verdict.js") < position("../verdict/domain/outcome.js"));
  assert.ok(position("../verdict/domain/outcome.js") < position("../verdict/application/verdict-service.js"));
  assert.ok(position("../platform/providers/mock.js") < position("../platform/providers/index.js"));
  assert.ok(position("../verdict/ui/verdict-ui.js") < position("../protection/application/navigation-service.js"));
  assert.ok(imported.every((file) => !/^\.\.\/app\//.test(file) && !/molecules|dom\.js|-views\.js|-page\.js/.test(file)));
});

test("the worker keeps no state in globals, no timers, no promise chains and no network", () => {
  assert.doesNotMatch(source, /\bsetTimeout\b|\bsetInterval\b/);
  assert.doesNotMatch(source, /\.then\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|Sereno\.providers\.(mock|remote)/);
  assert.doesNotMatch(source, /^(let|var|const)\s/m);
});

test("a real navigation gets a verdict, a badge, a popup state and a tab message", async () => {
  const [onUpdated] = listeners.onUpdated;
  const url = "https://pago-servicios-linea.net/checkout";
  await onUpdated(1, { status: "loading", url }, { id: 1, url });

  assert.equal(badges[badges.length - 1].tabId, 1);
  assert.equal(badges[badges.length - 1].text, "✕");
  const outcomes = messages.map((entry) => entry.message.outcome.kind);
  assert.equal(outcomes[outcomes.length - 1], "verdict");
  assert.ok(messages.every((entry) => entry.tabId === 1 && entry.message.type === "sereno:outcome"));
  assert.equal(messages[messages.length - 1].message.outcome.verdict.status, "bloqueo");

  const state = localData["sereno.state.v1"];
  assert.equal(state.currentSite.status, "bloqueo");
  assert.equal(state.currentSite.domain, "pago-servicios-linea.net");
  assert.equal(state.protectionLevel, "active");
  assert.ok(sessionData.has("sereno.tab.1"));
});

test("activating and closing a tab use the stored outcome", async () => {
  const [onActivated] = listeners.onActivated;
  const [onRemoved] = listeners.onRemoved;
  const before = badges.length;
  await onActivated({ tabId: 1, windowId: 1 });
  assert.equal(badges.length, before + 1);
  assert.equal(badges[badges.length - 1].text, "✕");

  await onRemoved(1, { windowId: 1, isWindowClosing: false });
  assert.equal(sessionData.has("sereno.tab.1"), false);
});

test("non web pages and irrelevant tab events are ignored", async () => {
  const [onUpdated] = listeners.onUpdated;
  const before = { badges: badges.length, messages: messages.length };
  await onUpdated(2, { status: "loading", url: "chrome://extensions/" }, { id: 2, url: "chrome://extensions/" });
  await onUpdated(2, { title: "x" }, { id: 2, url: "https://a.pe/" });
  await onUpdated(2, { status: "complete" }, undefined);
  assert.deepEqual({ badges: badges.length, messages: messages.length }, before);
});

function ask(message, tabId, url) {
  const [onMessage] = listeners["runtime.onMessage"];
  return new Promise((resolve) => {
    const keptOpen = onMessage(message, tabId === undefined ? {} : { id: "abc", tab: { id: tabId, url } }, resolve);
    if (keptOpen !== true) {
      resolve("not kept open");
    }
  });
}

test("content script requests are answered asynchronously from the stored tab record", async () => {
  const url = "https://paypal-secure-login.com/login";
  const [onUpdated] = listeners.onUpdated;
  await onUpdated(3, { status: "loading", url }, { id: 3, url });

  const current = await ask({ type: "sereno:get-outcome" }, 3, url);
  assert.equal(current.ok, true);
  assert.equal(current.outcome.verdict.status, "advertencia");

  assert.deepEqual(await ask({ type: "sereno:continue", url }, 3, url), { ok: true });
  assert.deepEqual(sessionData.get("sereno.tab.3").continued, ["https://paypal-secure-login.com"]);
  assert.equal((await ask({ type: "sereno:get-outcome" }, 3, url)).acknowledged, true);

  assert.deepEqual(await ask({ type: "sereno:detail", url }, 3, url), { ok: true });
  assert.deepEqual(created, [{ url: "chrome-extension://abc/app/popup/popup.html" }]);
});

test("a block is never continued through the worker", async () => {
  const url = "https://pago-servicios-linea.net/checkout";
  const [onUpdated] = listeners.onUpdated;
  await onUpdated(4, { status: "loading", url }, { id: 4, url });
  assert.deepEqual(await ask({ type: "sereno:continue", url }, 4, url), { ok: false, error: "blocked" });
});

test("messages that are not for the content script are left alone", () => {
  const [onMessage] = listeners["runtime.onMessage"];
  assert.notEqual(onMessage({ type: "other" }, { id: "abc" }, () => {}), true);
  assert.notEqual(onMessage(undefined, undefined, () => {}), true);
});

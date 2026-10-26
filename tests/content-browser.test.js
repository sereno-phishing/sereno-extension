"use strict";

/* Browser adapter pieces the content script needs: receive the worker's
   messages, ask the worker, and build extension URLs. chrome is a fake. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

function installChrome(runtime) {
  globalThis.chrome = { runtime };
  return () => {
    delete globalThis.chrome;
  };
}

const Sereno = load("platform/browser.js");

test("onMessage subscribes once and passes only the message, never answering", () => {
  const added = [];
  const restore = installChrome({ id: "abc", onMessage: { addListener: (fn) => added.push(fn) } });
  try {
    const seen = [];
    Sereno.browser.onMessage((message) => seen.push(message));
    assert.equal(added.length, 1);
    const result = added[0]({ type: "sereno:outcome" }, { id: "abc" }, () => {});
    assert.notEqual(result, true);
    assert.deepEqual(seen, [{ type: "sereno:outcome" }]);
    added[0]({ type: "x" }, { id: "evil" }, () => {});
    assert.equal(seen.length, 1, "messages from another extension are ignored");
  } finally {
    restore();
  }
});

test("onMessage outside the extension does nothing", () => {
  assert.doesNotThrow(() => Sereno.browser.onMessage(() => {}));
});

test("sendMessage returns the worker reply and turns a lost context into null", async () => {
  const restore = installChrome({
    sendMessage: async (message) => {
      if (message.type === "boom") {
        throw new Error("Extension context invalidated.");
      }
      return { ok: true, echo: message.type };
    }
  });
  try {
    assert.deepEqual(await Sereno.browser.sendMessage({ type: "a" }), { ok: true, echo: "a" });
    assert.equal(await Sereno.browser.sendMessage({ type: "boom" }), null);
  } finally {
    restore();
  }
  assert.equal(await Sereno.browser.sendMessage({ type: "a" }), null);
});

test("assetUrl resolves against the extension, or stays relative outside it", () => {
  assert.equal(Sereno.browser.assetUrl("ui/tokens.css"), "ui/tokens.css");
  const restore = installChrome({ getURL: (file) => "chrome-extension://abc/" + file });
  try {
    assert.equal(Sereno.browser.assetUrl("ui/tokens.css"), "chrome-extension://abc/ui/tokens.css");
  } finally {
    restore();
  }
});

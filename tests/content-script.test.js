"use strict";

/* The content script is a container: it receives the worker's outcome message
   and drives the shadow-DOM UI. No jsdom here, so a minimal fake document and
   shadow root record what the container does. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "demo-store/ui/verdict-modal.js",
  "verdict/ui/page-overlay.js",
  "content/content-script.js"
);

const WARNING = { kind: "verdict", verdict: { domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo", latencyMs: 1 } };
const BLOCK = { kind: "verdict", verdict: { domain: "pago-servicios-linea.net", status: "bloqueo", score: 0.97, source: "cache", latencyMs: 1 } };
const SAFE = { kind: "verdict", verdict: { domain: "tienda.pe", status: "seguro", score: 0.04, source: "modelo", latencyMs: 1 } };
const PENDING = { kind: "pending", reason: "evaluating" };
const DEGRADED = { kind: "degraded", reason: "timeout" };

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.textContent = "";
    this.renders = 0;
    this.found = new Map();
    this.html = "";
    this.open = false;
    this.opened = 0;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] === undefined ? null : this.attributes[name];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  attachShadow(init) {
    this.shadowInit = init;
    this.shadow = new FakeElement("#shadow");
    return this.shadow;
  }

  addEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).concat([fn]);
  }

  emit(type, event) {
    const fired = event || { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    (this.listeners[type] || []).forEach((fn) => fn(fired));
    return fired;
  }

  set innerHTML(value) {
    this.html = value;
    this.renders += 1;
    this.found = new Map();
  }

  get innerHTML() {
    return this.html;
  }

  querySelector(selector) {
    if (!this.html || (selector === "dialog" && !/<dialog /.test(this.html))) {
      return null;
    }
    if (!this.found.has(selector)) {
      const element = new FakeElement(selector);
      const owner = this;
      element.showModal = () => {
        element.open = true;
        element.opened += 1;
      };
      element.close = () => {
        if (element.open) {
          element.open = false;
          element.emit("close");
        }
      };
      element.owner = owner;
      this.found.set(selector, element);
    }
    return this.found.get(selector);
  }
}

function setup(options) {
  const settings = options || {};
  const root = { host: null };
  const documentElement = new FakeElement("html");
  const fakeDocument = {
    activeElement: null,
    documentElement,
    createElement(tag) {
      const element = new FakeElement(tag);
      if (tag === "div" && !root.host) {
        root.host = element;
      } else if (tag === "div" && !root.inner) {
        root.inner = element;
      }
      return element;
    }
  };
  const handlers = [];
  const sent = [];
  const browser = {
    onMessage(handler) {
      handlers.push(handler);
    },
    async sendMessage(message) {
      sent.push(message);
      if (settings.sendFails) {
        throw new Error("Extension context invalidated");
      }
      return settings.replies ? settings.replies[message.type] : undefined;
    },
    assetUrl(file) {
      return "chrome-extension://abc/" + file;
    }
  };
  const calls = { back: 0, replaced: [] };
  const env = {
    document: fakeDocument,
    browser,
    location: { href: "https://paypal-secure-login.com/login", replace(url) { calls.replaced.push(url); } },
    history: { length: settings.historyLength === undefined ? 3 : settings.historyLength, back() { calls.back += 1; } },
    now: () => new Date(2026, 9, 25, 10, 30, 0)
  };
  const script = Sereno.contentScript.create(env);
  return {
    script,
    handlers,
    sent,
    calls,
    documentElement,
    get host() {
      return root.host;
    },
    get surface() {
      return root.inner;
    },
    deliver(outcome, extra) {
      return script.handleMessage(Object.assign({ type: "sereno:outcome", outcome }, extra));
    },
    click(action, data) {
      const element = new FakeElement("button");
      element.setAttribute("data-action", action);
      if (data) {
        element.setAttribute("data-detail", data);
      }
      root.inner.emit("click", { target: { closest: () => element } });
      return element;
    },
    dialog() {
      return root.inner.querySelector("dialog");
    }
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("start registers the message listener right away and asks the worker for the current outcome", async () => {
  const ui = setup({ replies: { "sereno:get-outcome": { ok: true, outcome: WARNING } } });
  const started = ui.script.start();
  assert.equal(ui.handlers.length, 1);
  await started;
  assert.deepEqual(ui.sent, [{ type: "sereno:get-outcome" }]);
  assert.match(ui.surface.innerHTML, /paypal-secure-login\.com/);
});

test("a missing or failed reply to get-outcome shows nothing and never throws", async () => {
  const none = setup({ replies: { "sereno:get-outcome": { ok: true, outcome: null } } });
  await none.script.start();
  assert.equal(none.host, null);

  const failing = setup({ sendFails: true });
  await failing.script.start();
  assert.equal(failing.host, null);
});

test("the listener handles only sereno:outcome messages", () => {
  const ui = setup();
  ui.script.start();
  const handler = ui.handlers[0];
  handler({ type: "other", outcome: WARNING });
  handler(null);
  handler({ type: "sereno:outcome", outcome: WARNING });
  assert.match(ui.surface.innerHTML, /<dialog /);
});

test("a warning opens one closed shadow host with the extension stylesheets and a native modal dialog", async () => {
  const ui = setup();
  await ui.deliver(WARNING);
  assert.equal(ui.documentElement.children.length, 1);
  assert.equal(ui.documentElement.children[0], ui.host);
  assert.deepEqual(ui.host.shadowInit, { mode: "closed" });
  const links = ui.host.shadow.children.filter((child) => child.tagName === "link");
  assert.deepEqual(
    links.map((link) => link.attributes.href),
    ["chrome-extension://abc/ui/tokens.css", "chrome-extension://abc/ui/verdict-modal.css", "chrome-extension://abc/content/content.css"]
  );
  assert.ok(links.every((link) => link.attributes.rel === "stylesheet"));
  assert.equal(ui.dialog().opened, 1);
  assert.equal(ui.dialog().open, true);
  assert.equal(ui.documentElement.style.overflow, "hidden");
  assert.equal(ui.surface.querySelector(".verdict-score-fill").style.width, "92%");
});

test("the same outcome twice renders once and does not stack another host", async () => {
  const ui = setup();
  await ui.deliver(WARNING);
  await ui.deliver(JSON.parse(JSON.stringify(WARNING)));
  assert.equal(ui.surface.renders, 1);
  assert.equal(ui.dialog().opened, 1);
  assert.equal(ui.documentElement.children.length, 1);
});

test("Continuar bajo riesgo tells the worker, closes the modal and is not reopened by the same outcome", async () => {
  const ui = setup({ replies: { "sereno:continue": { ok: true } } });
  await ui.deliver(WARNING);
  const dialog = ui.dialog();
  ui.click("continuar");
  await flush();
  assert.deepEqual(ui.sent, [{ type: "sereno:continue", url: "https://paypal-secure-login.com/login" }]);
  assert.equal(dialog.open, false);
  assert.equal(ui.documentElement.style.overflow, "");
  await ui.deliver(WARNING);
  assert.equal(ui.surface.innerHTML, "");
  assert.equal(ui.documentElement.children.length, 1);
});

test("a failing worker does not trap the user: the modal still closes", async () => {
  const ui = setup({ sendFails: true });
  await ui.deliver(WARNING);
  const dialog = ui.dialog();
  ui.click("continuar");
  await flush();
  assert.equal(dialog.open, false);
});

test("the block modal has no continue path even if the action is forced", async () => {
  const ui = setup();
  await ui.deliver(BLOCK);
  const dialog = ui.dialog();
  ui.click("continuar");
  await flush();
  assert.deepEqual(ui.sent, []);
  assert.equal(dialog.open, true);
});

test("Esc is cancelled on the block modal and allowed on the warning", async () => {
  const block = setup();
  await block.deliver(BLOCK);
  assert.equal(block.dialog().emit("cancel").defaultPrevented, true);

  const warning = setup();
  await warning.deliver(WARNING);
  assert.equal(warning.dialog().emit("cancel").defaultPrevented, false);
});

test("closing the warning with Esc dismisses it for the same outcome", async () => {
  const ui = setup();
  await ui.deliver(WARNING);
  ui.dialog().close();
  assert.equal(ui.documentElement.style.overflow, "");
  await ui.deliver(WARNING);
  assert.equal(ui.surface.renders, 1);
  assert.deepEqual(ui.sent, []);
});

test("the final outcome replaces the pending toast, and a safe verdict clears the page", async () => {
  const ui = setup();
  await ui.deliver(PENDING);
  assert.match(ui.surface.innerHTML, /Evaluación pendiente/);
  assert.equal(ui.dialog(), null);

  await ui.deliver(BLOCK);
  assert.doesNotMatch(ui.surface.innerHTML, /Evaluación pendiente/);
  assert.match(ui.surface.innerHTML, /Sitio bloqueado/);
  const dialog = ui.dialog();

  await ui.deliver(SAFE);
  assert.equal(ui.surface.innerHTML, "");
  assert.equal(dialog.open, false);
  assert.equal(ui.documentElement.style.overflow, "");
});

test("a new modal replaces the previous one", async () => {
  const ui = setup();
  await ui.deliver(WARNING);
  const first = ui.dialog();
  await ui.deliver(BLOCK);
  assert.equal(first.open, false);
  assert.match(ui.surface.innerHTML, /Sitio bloqueado/);
  assert.equal(ui.dialog().open, true);
});

test("the degraded notice is non-blocking and can be dismissed", async () => {
  const ui = setup();
  await ui.deliver(DEGRADED);
  assert.match(ui.surface.innerHTML, /Protección degradada/);
  assert.equal(ui.dialog(), null);
  ui.click("dismiss");
  assert.equal(ui.surface.innerHTML, "");
  await ui.deliver(DEGRADED);
  assert.equal(ui.surface.innerHTML, "");
});

test("a warning already continued on this origin is not shown when the worker marks it acknowledged", async () => {
  const ui = setup({ replies: { "sereno:get-outcome": { ok: true, outcome: WARNING, acknowledged: true } } });
  await ui.script.start();
  assert.equal(ui.host, null);
  await ui.deliver(WARNING, { acknowledged: true });
  assert.equal(ui.host, null);
  await ui.deliver(BLOCK, { acknowledged: true });
  assert.match(ui.surface.innerHTML, /Sitio bloqueado/);
});

test("Volver goes back, or to a blank page when there is no history", async () => {
  const withHistory = setup({ historyLength: 4 });
  await withHistory.deliver(BLOCK);
  withHistory.click("volver");
  assert.equal(withHistory.calls.back, 1);

  const alone = setup({ historyLength: 1 });
  await alone.deliver(BLOCK);
  alone.click("volver");
  assert.deepEqual(alone.calls.replaced, ["about:blank"]);
});

test("Ver detalle toggles the details and Abrir detalle asks the worker", async () => {
  const ui = setup();
  await ui.deliver(WARNING);
  const details = ui.surface.querySelector("#warning-details");
  details.hidden = true;
  const toggle = ui.click("toggle-detail", "warning");
  assert.equal(details.hidden, false);
  assert.equal(toggle.textContent, "Ocultar detalle");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  ui.click("toggle-detail", "warning");
  assert.equal(details.hidden, true);

  ui.click("open-detail");
  await flush();
  assert.deepEqual(ui.sent, [{ type: "sereno:detail", url: "https://paypal-secure-login.com/login" }]);
});

test("the modal date is stamped when it opens", async () => {
  const ui = setup();
  await ui.deliver(WARNING);
  assert.match(ui.surface.querySelector("#warning-stamp").textContent, /2026/);
});

test("the content script never talks to a backend or to the provider seam", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "content", "content-script.js"), "utf8");
  assert.doesNotMatch(source, /services|providers|\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|new Function|\.then\(/);
  assert.match(source, /^[\s\S]*onMessage/m);
});

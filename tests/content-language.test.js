"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const s = load("platform/storage.js", "platform/i18n.js", "time/domain/time.js", "verdict/domain/verdict.js", "verdict/domain/outcome.js", "ui/atoms.js", "content/content-assets.generated.js", "verdict/ui/verdict-ui.js", "demo-store/ui/verdict-modal.js", "verdict/ui/page-overlay.js", "content/content-script.js");

test("pending and degraded overlays follow the selected language without changing outcome data", () => {
  const pending = { kind: "pending", reason: "evaluating" };
  const degraded = { kind: "degraded", reason: "offline" };
  s.i18n.use("en");
  assert.match(s.pageOverlay.plan(pending).html, /Pending evaluation/);
  assert.match(s.pageOverlay.plan(degraded).html, /Offline/);
  assert.match(s.pageOverlay.plan(degraded).html, /Got it/);
  assert.match(s.verdictUi.pill("advertencia", "sm"), /Warning/);
  assert.equal(s.verdictUi.FACT_LABELS.risk, "Risk level");
  assert.deepEqual(degraded, { kind: "degraded", reason: "offline" });
  s.i18n.use("es");
  assert.match(s.pageOverlay.plan(pending).html, /Evaluación pendiente/);
  assert.match(s.pageOverlay.plan(degraded).html, /Sin conexión/);
});

test("storage changes translate a visible notice and do not reopen it after dismissal", async () => {
  let watch, surface, host;
  const storage = { get: async () => "es", set: async () => {}, watch: (_, fn) => { watch = fn; } };
  function element(tag) {
    const el = { tag, style: {}, attrs: {}, listeners: {}, children: [], nodes: [],
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      appendChild(child) { this.children.push(child); }, addEventListener(k, fn) { this.listeners[k] = fn; },
      attachShadow() { return element("shadow"); }, querySelector() { return null; },
      querySelectorAll(selector) { return this.nodes.filter(n => n.attrs[selector.slice(1, -1)] !== undefined); } };
    Object.defineProperty(el, "innerHTML", { set(html) {
      this.html = html; this.nodes = [];
      const re = /data-(overlay-i18n|overlay-notice)="([^"]+)"[^>]*>([^<]*)/g;
      for (const match of html.matchAll(re)) this.nodes.push({ attrs: { ["data-" + match[1]]: match[2] }, textContent: match[3], getAttribute(k) { return this.attrs[k]; } });
    }, get() { return this.html || ""; } });
    return el;
  }
  const doc = { documentElement: element("html"), createElement(tag) { const el = element(tag); if (tag === "div") { if (!host) host = el; else surface = el; } return el; } };
  const script = s.contentScript.create({ document: doc, storage, browserLanguage: "en-US", browser: { onMessage() {}, async sendMessage() { return null; } }, location: { href: "https://example.test" }, history: {}, now: () => new Date() });
  await script.start();
  await script.handleMessage({ type: "sereno:outcome", outcome: { kind: "degraded", reason: "offline" } });
  const noticeText = surface.nodes.find(n => n.attrs["data-overlay-notice"] === "text");
  assert.match(noticeText.textContent, /Sin conexión/);
  watch("en");
  assert.equal(surface.attrs.lang, "en");
  assert.match(noticeText.textContent, /Offline/);
  surface.listeners.click({ target: { closest: () => ({ getAttribute: () => "dismiss" }) } });
  assert.equal(surface.innerHTML, "");
  watch("es");
  assert.equal(surface.innerHTML, "");
  await script.handleMessage({ type: "sereno:outcome", outcome: { kind: "degraded", reason: "offline" } });
  assert.equal(surface.innerHTML, "");
});

test("content manifest loads storage and i18n before outcome and shared modal", () => {
  const manifest = require("../manifest.json");
  const files = manifest.content_scripts[0].js;
  assert.ok(files.indexOf("platform/storage.js") < files.indexOf("platform/i18n.js"));
  assert.ok(files.indexOf("platform/i18n.js") < files.indexOf("verdict/domain/outcome.js"));
  assert.ok(files.indexOf("platform/i18n.js") < files.indexOf("demo-store/ui/verdict-modal.js"));
});

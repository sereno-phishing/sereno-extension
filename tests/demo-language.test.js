"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

test("shared modal translates UI but preserves domain and numeric values", () => {
  const s = load("platform/i18n.js", "verdict/domain/verdict.js", "ui/atoms.js", "verdict/ui/verdict-ui.js", "demo-store/ui/verdict-modal.js");
  const scenario = { domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo" };
  s.i18n.use("en");
  const html = s.verdictModal.render(scenario);
  assert.match(html, /This site may be phishing/);
  assert.match(html, /paypal-secure-login\.com/);
  assert.match(html, /0\.92/);
  assert.match(html, /data-modal-i18n="riskHighLower">high/);
  assert.match(html, /data-modal-i18n="riskHigh">High/);
  assert.match(html, /data-modal-i18n="sourceModel">Model/);
  assert.match(s.verdictModal.render({ ...scenario, source: "cache", score: 0.5 }), /data-modal-i18n="sourceCache">Cache/);
  s.i18n.use("es");
  assert.match(s.verdictModal.render(scenario), /Este sitio puede ser phishing/);
  assert.match(s.verdictModal.render({ ...scenario, status: "bloqueo" }), /Sitio bloqueado/);
  s.i18n.use("en");
  const title = { textContent: "", getAttribute: () => "titleBlock" };
  const risk = { textContent: "", getAttribute: () => "riskHigh" };
  const source = { textContent: "", getAttribute: () => "sourceModel" };
  const toggle = { textContent: "", getAttribute: () => "true" };
  s.verdictModal.translate({ querySelectorAll: (selector) => selector === "[data-modal-i18n]" ? [title, risk, source] : [toggle] });
  assert.equal(title.textContent, "Site blocked");
  assert.equal(risk.textContent, "High");
  assert.equal(source.textContent, "Model");
  assert.equal(toggle.textContent, "Hide details");
});

test("demo page follows changes without changing scenario identifiers", async () => {
  const vm = require("node:vm"), fs = require("node:fs");
  let watch;
  const node = { textContent: "", getAttribute: () => "demo.safe" };
  const doc = { documentElement: {}, querySelectorAll: (selector) => selector === "[data-i18n]" ? [node] : [] };
  const context = vm.createContext({ document: doc, navigator: { language: "fr" }, Sereno: { storage: { detect: () => ({ get: async () => undefined, watch: (key, cb) => { watch = cb; } }) } } });
  vm.runInContext(fs.readFileSync("platform/i18n.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("app/demo-store/store-language.js", "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(node.textContent, "Sitio seguro");
  watch("en");
  assert.equal(node.textContent, "Safe site");
  assert.equal(doc.documentElement.lang, "en");
});

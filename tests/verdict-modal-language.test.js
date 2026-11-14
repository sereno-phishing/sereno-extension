"use strict";

/* The verdict dialog translates its own copy and leaves backend values
   (domain, score) as they came. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

test("the verdict dialog translates UI but preserves domain and numeric values", () => {
  const s = load("platform/i18n.js", "verdict/domain/verdict.js", "ui/atoms.js", "verdict/ui/verdict-ui.js", "verdict/ui/verdict-modal.js");
  const verdict = { domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo" };
  s.i18n.use("en");
  const html = s.verdictModal.renderDialog(verdict);
  assert.match(html, /This site may be phishing/);
  assert.match(html, /paypal-secure-login\.com/);
  assert.match(html, /0\.92/);
  assert.match(html, /data-modal-i18n="riskHighLower">high/);
  assert.match(html, /data-modal-i18n="riskHigh">High/);
  assert.match(html, /data-modal-i18n="sourceModel">Model/);
  assert.match(s.verdictModal.renderDialog({ ...verdict, source: "cache", score: 0.5 }), /data-modal-i18n="sourceCache">Cache/);
  s.i18n.use("es");
  assert.match(s.verdictModal.renderDialog(verdict), /Este sitio puede ser phishing/);
  assert.match(s.verdictModal.renderDialog({ ...verdict, status: "bloqueo" }), /Sitio bloqueado/);
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

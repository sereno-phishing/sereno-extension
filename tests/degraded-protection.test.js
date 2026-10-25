"use strict";

/* Degraded protection (HU-26): the data shape and the presentational strings
   the popup shows when the verdict backend or its cache is unavailable. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "protection/domain/protection.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "protection/ui/protection-views.js"
);

const { protection, protectionUi } = Sereno;

test("protection level defaults to active and reads degraded from the state", () => {
  assert.equal(protection.levelOf({}), "active");
  assert.equal(protection.levelOf({ protectionLevel: "degraded" }), "degraded");
  assert.equal(protection.levelOf({ protectionLevel: "weird" }), "active");
  assert.equal(protection.isDegraded({ protectionLevel: "degraded" }), true);
  assert.equal(protection.isDegraded({}), false);
});

test("the protection card keeps its active copy by default", () => {
  const html = protectionUi.protectionCard();
  assert.match(html, /Protección activa/);
  assert.match(html, /Modo por defecto: Advertencia/);
  assert.doesNotMatch(html, /degradada/);
  assert.equal(protectionUi.protectionCard("active"), html);
});

test("the protection card shows the degraded state and does not claim to be active", () => {
  const html = protectionUi.protectionCard("degraded");
  assert.match(html, /Protección degradada/);
  assert.doesNotMatch(html, /Protección activa/);
  assert.match(html, /protection-card/);
});

test("the degraded card explains the reason when one is known", () => {
  assert.match(protectionUi.protectionCard("degraded", "cache_down"), /caché/i);
  assert.match(protectionUi.protectionCard("degraded", "offline"), /conexión/i);
  assert.doesNotMatch(protectionUi.protectionCard("degraded", "<b>x</b>"), /<b>/);
});

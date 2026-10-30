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

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("both protection cards are live regions so a change of level is announced", () => {
  assert.match(protectionUi.protectionCard("degraded"), /class="protection-card is-degraded" role="status"/);
  assert.match(protectionUi.protectionCard("active"), /class="protection-card" role="status"/);
});

test("the degraded card has amber styling built from the design tokens", () => {
  const css = read("app/popup/popup.css");
  const block = css.match(/\.protection-card\.is-degraded\s*\{([^}]*)\}/);
  assert.ok(block, "popup.css styles .protection-card.is-degraded");
  assert.match(block[1], /background:\s*var\(--amber-bg\)/);
  assert.match(block[1], /color:\s*var\(--amber-800\)/);
});

test("the site card marks a pending evaluation as busy and announces it", () => {
  const html = protectionUi.siteCard({ domain: "tienda.pe", status: "evaluando" });
  assert.match(html, /class="site-card is-pending"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(protectionUi.siteCard({ domain: "tienda.pe", status: "seguro" }), /is-pending|aria-busy/);
});

test("the site card says the site could not be checked when protection is degraded", () => {
  const html = protectionUi.siteCard({ domain: "tienda.pe", status: "pendiente" }, "degraded");
  assert.match(html, /class="site-card is-degraded"/);
  assert.match(html, /site-note/);
  assert.match(html, /No se pudo comprobar/);
  assert.doesNotMatch(protectionUi.siteCard({ domain: "tienda.pe", status: "seguro" }, "active"), /is-degraded|site-note/);
});

test("the popup ships a loading skeleton that the first render replaces", () => {
  const html = read("app/popup/popup.html");
  assert.match(html, /<div id="app"[^>]*aria-busy="true"[^>]*>[\s\S]*boot-skeleton[\s\S]*<\/div>\s*<script/);
  assert.match(html, /Cargando/);
  assert.match(html, /class="skeleton /);
  assert.match(read("app/popup/popup.css"), /\.boot-skeleton/);
});

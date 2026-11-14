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

test("without an evaluated site the card is idle: a status that is not busy, with no pill and no domain line", () => {
  for (const site of [null, undefined]) {
    const html = protectionUi.siteCard(site);
    assert.equal(html,
      '<div class="site-card is-idle" role="status">' +
      '<div class="site-label">Este sitio</div>' +
      '<div class="site-domain">Aún no hay un sitio evaluado.</div>' +
      '<div class="site-note">Sereno evaluará el próximo sitio que visites.</div>' +
      "</div>");
  }
  assert.doesNotMatch(protectionUi.siteCard({ domain: "tienda.pe", status: "seguro" }), /is-idle/);
  const css = fs.readFileSync(path.join(ROOT, "app", "popup", "popup.css"), "utf8");
  assert.match(css, /\.site-card\.is-pending,\s*\.site-card\.is-idle\s*\{\s*background:\s*var\(--slate-50\)/, "the idle card reuses the neutral surface");
  assert.match(css, /\.site-card\.is-idle \.site-note\s*\{\s*color:\s*var\(--muted\)/, "its note is muted, not a warning");
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

test("a site that could not be checked is its own state: not busy, with the not-evaluated pill instead of the pending one", () => {
  const site = Sereno.verdictOutcome.siteOf(Sereno.verdictOutcome.degraded("timeout"), "https://tienda.pe/pago", "2026-11-13T10:00");
  assert.equal(site.status, "sin_evaluar");
  /* Also a site published before this status existed, which said "evaluando". */
  for (const current of [site, { domain: "tienda.pe", status: "evaluando" }, { domain: "tienda.pe", status: "pendiente" }]) {
    const html = protectionUi.siteCard(current, "degraded");
    assert.match(html, /^<div class="site-card is-degraded" role="status">/);
    assert.doesNotMatch(html, /aria-busy|Evaluando|is-pending|◔/);
    assert.match(html, /<span class="pill pill-md pill-neutral"><span class="art-glyph art-14" aria-hidden="true">\?<\/span><span>Sin evaluar<\/span><\/span>/);
    assert.match(html, /No se pudo comprobar este sitio\. Evita ingresar datos de pago\./);
  }
  /* A pending evaluation keeps its own pill and stays busy. */
  const pending = protectionUi.siteCard(Sereno.verdictOutcome.siteOf(Sereno.verdictOutcome.pending(), "https://tienda.pe/", "t"), "active");
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /Evaluando…/);
  assert.doesNotMatch(pending, /Sin evaluar/);
});

test("the toolbar badge of a degraded outcome is the caution mark, never the pending dots", () => {
  load("protection/application/navigation-service.js");
  const badge = Sereno.navigationService.badgeOf(Sereno.verdictOutcome.degraded("offline"));
  assert.deepEqual(badge, { text: "?", color: "#D97706" });
  assert.equal(Sereno.navigationService.badgeOf(Sereno.verdictOutcome.pending()).text, "…");
});

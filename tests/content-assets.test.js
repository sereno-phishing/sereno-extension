"use strict";

/* The in-page UI must never ask the page for a chrome-extension:// URL: styles
   and icons travel inside the content script bundle. These tests cover the
   generator (and that the committed bundle is in sync with its sources), the
   inline mode of the asset seam in ui/atoms.js, and the markup the in-page
   views produce in that mode. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const ROOT = path.join(__dirname, "..");
const generator = require("../tools/build-content-assets.js");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "demo-store/ui/verdict-modal.js",
  "verdict/ui/page-overlay.js",
  "content/content-assets.generated.js"
);

const ASSETS = Sereno.contentAssets;
const verdictOf = (status) => ({ kind: "verdict", verdict: { domain: "a.pe", status, score: 0.9, source: "modelo", latencyMs: 1 } });
const OUTCOMES = {
  warning: verdictOf("advertencia"),
  block: verdictOf("bloqueo"),
  safe: verdictOf("seguro"),
  pending: { kind: "pending", reason: "evaluating" },
  degraded: { kind: "degraded", reason: "offline" }
};

function inContentMode(fn) {
  Sereno.ui.setInlineAssets(ASSETS.icons);
  try {
    return fn();
  } finally {
    Sereno.ui.setInlineAssets(null);
  }
}

test("the committed bundle is in sync with its sources (run node tools/build-content-assets.js)", () => {
  /* git autocrlf may check the file out with CRLF; the generator always writes LF. */
  const committed = fs.readFileSync(path.join(ROOT, generator.OUTPUT), "utf8").replace(/\r\n/g, "\n");
  assert.equal(committed, generator.build(), "content/content-assets.generated.js is out of date");
});

test("the generator is deterministic and writes LF only", () => {
  const first = generator.build();
  assert.equal(generator.build(), first);
  assert.ok(!first.includes("\r"));
  assert.match(first, /^\/\* GENERATED FILE/);
  assert.match(first, /node tools\/build-content-assets\.js/);
});

test("the bundled css has no external reference: no url(), @import, @font-face or extension URL", () => {
  assert.equal(typeof ASSETS.css, "string");
  assert.doesNotMatch(ASSETS.css, /url\(|@import|@font-face|chrome-extension|\.woff/);
  assert.match(ASSETS.css, /:host/);
  assert.match(ASSETS.css, /\.verdict-dialog/);
  assert.match(ASSETS.css, /\.sereno-toast/);
  assert.ok(!ASSETS.css.includes("\r"));
});

test("the bundled icons are inline svg without ids, scripts or references", () => {
  const names = Object.keys(ASSETS.icons);
  assert.deepEqual(names, names.slice().sort());
  ["alert-bad-44", "alert-warn-44", "alert-bad-14", "alert-warn-14", "toast-pending-32", "brand"].forEach((name) => {
    assert.ok(ASSETS.icons[name], name + " is bundled");
  });
  names.forEach((name) => {
    const svg = ASSETS.icons[name];
    assert.match(svg, /^<svg\b[\s\S]*<\/svg>$/, name);
    assert.doesNotMatch(svg, /\sid=|url\(|xlink:href|<script|\bon\w+=|<image|<img|\n/i, name);
  });
});

test("inline mode renders icons as svg and logo as the brand mark; null restores the default", () => {
  const defaults = [Sereno.ui.icon("ok", "c"), Sereno.ui.logo("l", ""), Sereno.ui.sizedIcon("alert-warn-14", "", 14)];
  assert.equal(defaults[0], '<img class="c" src="../../assets/icons/ok.svg" alt="">');
  assert.equal(defaults[1], '<img class="l" src="../../assets/logo.png" alt="">');
  assert.equal(defaults[2], '<img src="../../assets/icons/alert-warn-14.svg" width="14" height="14" alt="">');

  inContentMode(() => {
    const icon = Sereno.ui.sizedIcon("alert-bad-44", "verdict-icon", 44);
    assert.match(icon, /^<svg class="verdict-icon"/);
    assert.match(icon, /width="44" height="44"/);
    assert.match(icon, /aria-hidden="true"/);
    assert.equal((icon.match(/^<svg[^>]*>/)[0].match(/\swidth="/g) || []).length, 1, "the size replaces the natural one");
    assert.equal(Sereno.ui.sizedIcon("alert-warn-14", "", 16).startsWith("<svg width=\"16\""), true);
    assert.match(Sereno.ui.logo("verdict-logo", ""), /^<svg class="verdict-logo"/);
    assert.match(Sereno.ui.icon("toast-pending-32", "x"), /^<svg class="x"/);
    assert.equal(Sereno.ui.icon("does-not-exist", "x"), "", "a missing icon never falls back to a URL");
    assert.equal(Sereno.ui.image("somewhere/else.png", "x", "alt"), "");
  });

  assert.deepEqual([Sereno.ui.icon("ok", "c"), Sereno.ui.logo("l", ""), Sereno.ui.sizedIcon("alert-warn-14", "", 14)], defaults);
});

test("an inline logo with alt text is exposed as an image, a decorative one is hidden", () => {
  inContentMode(() => {
    assert.match(Sereno.ui.logo("l", "Sereno"), /role="img" aria-label="Sereno"/);
    assert.match(Sereno.ui.logo("l", ""), /aria-hidden="true"/);
  });
});

test("in content mode no in-page view asks for a URL: no chrome-extension://, no src, no assets path", () => {
  inContentMode(() => {
    Object.keys(OUTCOMES).forEach((name) => {
      const plan = Sereno.pageOverlay.plan(OUTCOMES[name]);
      const html = plan.html || "";
      assert.doesNotMatch(html, /chrome-extension:|<img|\ssrc=|\shref=|assets\/|url\(/, name);
    });
    const warning = Sereno.pageOverlay.plan(OUTCOMES.warning).html;
    assert.match(warning, /<svg class="verdict-icon"/);
    assert.match(warning, /<svg class="verdict-logo"/);
    assert.match(Sereno.pageOverlay.plan(OUTCOMES.pending).html, /<svg class="sereno-toast-icon"/);
    assert.match(Sereno.pageOverlay.plan(OUTCOMES.degraded).html, /<svg class="sereno-notice-icon"/);
  });
});

test("outside content mode the same views still point at the page-relative assets", () => {
  const html = Sereno.pageOverlay.plan(OUTCOMES.warning).html;
  assert.match(html, /<img[^>]+src="\.\.\/\.\.\/assets\/icons\/alert-warn-44\.svg"/);
  assert.match(html, /<img[^>]+src="\.\.\/\.\.\/assets\/logo\.png"/);
});

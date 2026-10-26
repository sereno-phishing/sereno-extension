"use strict";

/* The verdict modal view is shared by the demo store (overlay) and the real
   pages (native dialog). Both come from the same card markup. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "demo-store/ui/verdict-modal.js"
);

const modal = Sereno.verdictModal;
const WARNING = { domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo" };
const BLOCK = { domain: "pago-servicios-linea.net", status: "bloqueo", score: 0.97, source: "cache" };

test("the demo overlay keeps its markup: hidden overlay with a labelled dialog section", () => {
  const html = modal.render(WARNING);
  assert.match(html, /<div class="demo-overlay" id="warning-overlay" hidden>/);
  assert.match(html, /<section class="verdict-modal" role="dialog" aria-modal="true" aria-labelledby="warning-title"/);
  assert.match(html, /data-action="continuar"/);
  assert.match(modal.render(BLOCK), /id="block-overlay"/);
});

test("the dialog shell reuses the same card inside a native dialog without a second dialog role", () => {
  const html = modal.renderDialog(WARNING);
  assert.match(html, /^<dialog class="verdict-dialog" id="warning-dialog" aria-labelledby="warning-title" aria-describedby="warning-text"/);
  assert.doesNotMatch(html, /role="dialog"/);
  assert.match(html, /<section class="verdict-modal">/);
  assert.match(html, /id="warning-title"/);
  assert.match(html, /id="warning-text"/);
  assert.match(html, /paypal-secure-login\.com/);
  assert.match(html, /Ver detalle/);
  assert.match(html, /<\/dialog>$/);
});

test("the warning dialog can continue and closes with a close request; the block dialog never can", () => {
  const warning = modal.renderDialog(WARNING);
  assert.match(warning, /closedby="closerequest"/);
  assert.match(warning, /data-closable="true"/);
  assert.match(warning, /data-action="continuar"/);
  assert.match(warning, /Continuar bajo riesgo/);

  const block = modal.renderDialog(BLOCK);
  assert.match(block, /closedby="none"/);
  assert.match(block, /data-closable="false"/);
  assert.doesNotMatch(block, /data-action="continuar"/);
  assert.doesNotMatch(block, /Continuar bajo riesgo/);
  assert.match(block, /Volver a un sitio seguro/);
});

test("closable and continuable depend only on the status", () => {
  assert.equal(modal.isClosable("advertencia"), true);
  assert.equal(modal.isClosable("bloqueo"), false);
  assert.equal(modal.canContinue("advertencia"), true);
  assert.equal(modal.canContinue("bloqueo"), false);
  assert.equal(modal.canContinue("seguro"), false);
});

test("the open-detail link is added only when asked", () => {
  assert.doesNotMatch(modal.renderDialog(WARNING), /data-action="open-detail"/);
  assert.match(modal.renderDialog(WARNING, { openDetail: true }), /data-action="open-detail"/);
});

test("the score bar carries its percentage so the container can size it without inline styles", () => {
  assert.match(modal.renderDialog({ ...WARNING, score: 0.63 }), /data-percent="63"/);
});

test("icons follow the asset root, which a content script points at the extension", () => {
  Sereno.ui.setAssetRoot("chrome-extension://abc/assets/");
  try {
    assert.match(modal.renderDialog(WARNING), /src="chrome-extension:\/\/abc\/assets\/icons\/alert-warn-44\.svg"/);
  } finally {
    Sereno.ui.setAssetRoot();
  }
  assert.match(modal.renderDialog(WARNING), /src="\.\.\/\.\.\/assets\/icons\/alert-warn-44\.svg"/);
});

"use strict";

/* A verdict is requested once per navigation: the pending toast shows after
   300 ms and is replaced by the final outcome (a verdict, or a degraded notice
   when the request fails or times out). Nothing asks again until the user
   navigates or reloads, so no text may promise an automatic retry. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const Sereno = load(
  "platform/storage.js", "platform/i18n.js", "time/domain/time.js",
  "verdict/domain/verdict.js", "verdict/domain/outcome.js", "protection/domain/protection.js",
  "ui/atoms.js", "content/content-assets.generated.js", "verdict/ui/verdict-ui.js",
  "verdict/ui/verdict-modal.js", "verdict/ui/page-overlay.js",
  "app/popup/popup-i18n.js", "protection/ui/protection-views.js"
);

const ROOT = path.join(__dirname, "..");
const PENDING = { kind: "pending", reason: "evaluating" };
const RETRY_PROMISE = /reintent|retry|retrying|automátic|automatic/i;

const PENDING_COPY = {
  es: [
    "Evaluación pendiente",
    "Aún no pudimos revisar este sitio. Evita ingresar datos de pago hasta que termine.",
    "Sereno sigue evaluando este sitio."
  ],
  en: [
    "Pending evaluation",
    "We haven't checked this site yet. Avoid entering payment details until the check finishes.",
    "Sereno is still evaluating this site."
  ]
};

function paragraphs(html) {
  return Array.from(html.matchAll(/<p [^>]*>(.*?)<\/p>/g), (found) => found[1].replace(/&#39;/g, "'"));
}

function inEachLanguage(check) {
  ["es", "en"].forEach((language) => {
    Sereno.i18n.use(language);
    check(language);
  });
  Sereno.i18n.use("es");
}

test("the pending toast says the evaluation is still running, in both languages", () => {
  inEachLanguage((language) => {
    assert.deepEqual(paragraphs(Sereno.pageOverlay.plan(PENDING).html), PENDING_COPY[language], language);
  });
});

test("the pending toast and the degraded notice never promise a retry", () => {
  inEachLanguage((language) => {
    assert.doesNotMatch(Sereno.pageOverlay.plan(PENDING).html, RETRY_PROMISE, language + " pending");
    Sereno.verdictOutcome.REASONS.forEach((reason) => {
      const html = Sereno.pageOverlay.plan({ kind: "degraded", reason }).html;
      assert.doesNotMatch(html, RETRY_PROMISE, language + " " + reason);
    });
  });
});

test("the popup cards for a pending or degraded site never promise a retry", () => {
  const site = { domain: "tienda.pe", status: "evaluando", score: null, source: null, ts: "2026-11-13T10:00" };
  inEachLanguage((language) => {
    const cards = [Sereno.protectionUi.siteCard(site, "active"), Sereno.protectionUi.siteCard(site, "degraded"), Sereno.protectionUi.protectionCard("degraded")]
      .concat(Sereno.verdictOutcome.REASONS.map((reason) => Sereno.protectionUi.protectionCard("degraded", reason)));
    cards.forEach((html) => assert.doesNotMatch(html, RETRY_PROMISE, language));
  });
});

/* Every file the extension ships: scripts, pages and styles outside the tests,
   the tools and the task notes. */
function shippedFiles(dir, found) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir !== ROOT || !/^(tests|tools|odd|node_modules|\..*)$/.test(entry.name)) {
        shippedFiles(full, found);
      }
    } else if (/\.(js|html|css|json)$/.test(entry.name)) {
      found.push(full);
    }
  });
  return found;
}

test("no shipped file says that Sereno is retrying", () => {
  const files = shippedFiles(ROOT, []);
  assert.ok(files.length > 40);
  files.forEach((file) => {
    assert.equal(/reintentando|retrying/i.test(fs.readFileSync(file, "utf8")), false, path.relative(ROOT, file));
  });
});

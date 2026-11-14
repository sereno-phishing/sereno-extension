"use strict";

/* The backend answers a class, a score, a policy and a source, and nothing
   else. The text that explains a warning or a block may only say what follows
   from that data: it never names a reason the product does not compute. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load("platform/i18n.js", "verdict/domain/verdict.js", "ui/atoms.js", "verdict/ui/verdict-ui.js", "verdict/ui/verdict-modal.js");

const COPY = {
  advertencia: {
    es: "Sereno detectó señales de phishing en la dirección de este sitio. Puedes volver o continuar bajo tu propio riesgo.",
    en: "Sereno detected signs of phishing in this site's address. You can go back or continue at your own risk."
  },
  bloqueo: {
    es: "Sereno detectó señales de phishing en la dirección de este sitio y el administrador configuró el bloqueo para este dominio.",
    en: "Sereno detected signs of phishing in this site's address and the administrator set this domain to be blocked."
  }
};

const KEYS = { advertencia: "warning", bloqueo: "block" };
const DOMAINS = ["paypal-secure-login.com", "mercadolibre.com.pe", "google.com", "127.0.0.1"];

/* The visible text of the explanation paragraph of a rendered dialog. */
function explanationOf(html, status) {
  const found = new RegExp('<p class="verdict-text" id="' + KEYS[status] + '-text">(.*?)</p>').exec(html);
  assert.ok(found, "the dialog has an explanation paragraph");
  return found[1].replace(/<[^>]+>/g, "").replace(/&#39;/g, "'");
}

test("the warning and the block explain themselves only with the class and the policy", () => {
  ["es", "en"].forEach((language) => {
    Sereno.i18n.use(language);
    Object.keys(COPY).forEach((status) => {
      DOMAINS.forEach((domain) => {
        const html = Sereno.verdictModal.renderDialog({ domain, status, score: 0.91, source: "modelo" });
        assert.equal(explanationOf(html, status), COPY[status][language], language + " " + status + " " + domain);
      });
    });
  });
  Sereno.i18n.use("es");
});

test("the explanation is the only sentence of the dialog and it changes with the language in place", () => {
  Sereno.i18n.use("es");
  const html = Sereno.verdictModal.renderDialog({ domain: "google.com", status: "bloqueo", score: 0.91, source: "cache" });
  const sentences = html.replace(/<[^>]+>/g, "\n").split("\n").map((line) => line.trim()).filter((line) => /\.$/.test(line));
  assert.deepEqual(sentences, [COPY.bloqueo.es]);

  Sereno.i18n.use("en");
  const nodes = ["textWarning", "textBlock"].map((key) => ({ textContent: "", getAttribute: () => key }));
  Sereno.verdictModal.translate({ querySelectorAll: (selector) => (selector === "[data-modal-i18n]" ? nodes : []) });
  assert.deepEqual(nodes.map((node) => node.textContent), [COPY.advertencia.en, COPY.bloqueo.en]);
  Sereno.i18n.use("es");
});

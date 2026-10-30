"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { i18n, privacyUi } = load("platform/i18n.js", "ui/atoms.js", "ui/molecules.js", "privacy/ui/privacy-views.js");

const COPY = {
  es: {
    heading: "Política de privacidad de Sereno",
    back: "Volver al inicio",
    rows: [
      ["Qué enviamos", "La dirección de la pestaña actual, cifrada por HTTPS, solo para evaluarla."],
      ["Qué guardamos", "Solo el hash y el dominio de cada URL. La dirección completa se procesa en memoria y no se conserva."],
      ["Tu cuenta", "Si creas una cuenta, guardamos tu usuario y el hash de tu contraseña. No pedimos correo."],
      ["Tus derechos", "Puedes borrar tu historial en cualquier momento desde el popup."]
    ]
  },
  en: {
    heading: "Sereno privacy policy",
    back: "Back to home",
    rows: [
      ["What we send", "The current tab's address, encrypted via HTTPS, only to evaluate it."],
      ["What we store", "Only the hash and domain of each URL. The full address is processed in memory and is not retained."],
      ["Your account", "If you create an account, we store your username and password hash. We do not ask for an email address."],
      ["Your rights", "You can delete your history at any time from the popup."]
    ]
  }
};

function text(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

test.afterEach(() => i18n.use("es"));

for (const language of ["es", "en"]) {
  test(`the privacy view renders its heading, four rows and back button in ${language}`, () => {
    i18n.use(language);
    const html = privacyUi.view();
    const copy = COPY[language];
    assert.equal(text(html), ["← " + copy.back, copy.heading, ...copy.rows.flat()].join(" "));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<h2\b/g) || []).length, 4);
    assert.equal((html.match(/class="privacy-check/g) || []).length, 4);
    assert.match(html, /data-action="privacy-close"/);
    assert.doesNotMatch(html, /data-enter/);
  });
}

test("the privacy view keeps the policy wording in the catalog, one entry per language", () => {
  const keys = ["heading", "send", "sendBody", "store", "storeBody", "account", "accountBody", "rights", "rightsBody", "back"];
  for (const language of ["es", "en"]) {
    keys.forEach((key) => assert.notEqual(i18n.message("privacy." + key, language), "privacy." + key));
  }
  assert.equal(i18n.message("privacy.title", "es"), "privacy.title");
});

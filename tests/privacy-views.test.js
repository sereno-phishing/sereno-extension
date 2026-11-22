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
      ["Tu cuenta", "Si creas una cuenta, guardamos tu usuario y el hash de tu contraseña, y tus consultas quedan vinculadas a ella para mostrarte tu historial. Sin cuenta, las consultas no se vinculan a nadie. No pedimos correo."],
      ["Encuesta de opinión", "Si tienes una cuenta, el menú de tu cuenta ofrece una encuesta opcional de 10 preguntas (escala SUS) hasta que la respondes. Guardamos tus 10 respuestas, del 1 al 5, y la fecha de envío, sin tu usuario ni ningún vínculo con tu cuenta. Aparte, registramos que tu cuenta participó, solo para evitar envíos repetidos. Mientras respondes, el borrador queda solo en tu navegador."],
      ["Dónde se alojan", "En Microsoft Azure, que actúa solo como proveedor de alojamiento e infraestructura. No vendemos tus datos ni los compartimos con nadie más."],
      ["Cuánto tiempo los guardamos", "Mientras el servicio esté activo y los datos sean necesarios para detectar phishing. Los veredictos en caché caducan solos: por defecto, a los 7 días los de phishing y a las 24 horas los legítimos."],
      ["Tus derechos", "Puedes borrar tu historial en cualquier momento desde el popup: tus consultas dejan de estar vinculadas a tu cuenta. Para pedir que eliminemos tus datos, escribe a u202220528@upc.edu.pe."],
      ["Responsables", "Andrés Torres García y Sebastián Lobato Pozo, autores del proyecto. Contacto: u202220528@upc.edu.pe."],
      ["Cambios en esta política", "Última actualización: 22 de noviembre de 2026. Si la política cambia, publicaremos la nueva versión aquí con una nueva fecha."]
    ]
  },
  en: {
    heading: "Sereno privacy policy",
    back: "Back to home",
    rows: [
      ["What we send", "The current tab's address, encrypted via HTTPS, only to evaluate it."],
      ["What we store", "Only the hash and domain of each URL. The full address is processed in memory and is not retained."],
      ["Your account", "If you create an account, we store your username and password hash, and your queries are linked to it to show you your history. Without an account, queries are not linked to anyone. We do not ask for an email address."],
      ["Feedback survey", "If you have an account, your account menu offers an optional 10-question survey (SUS scale) until you answer it. We store your 10 answers, from 1 to 5, and the submission date, without your username or any link to your account. Separately, we record that your account took part, only to prevent repeat submissions. While you answer, the draft stays only in your browser."],
      ["Where it is hosted", "On Microsoft Azure, which acts only as the hosting and infrastructure provider. We do not sell your data or share it with anyone else."],
      ["How long we keep it", "While the service is active and the data is needed to detect phishing. Cached verdicts expire on their own: by default, after 7 days for phishing and 24 hours for legitimate sites."],
      ["Your rights", "You can delete your history at any time from the popup: your queries are no longer linked to your account. To ask us to delete your data, write to u202220528@upc.edu.pe."],
      ["Data controllers", "Andrés Torres García and Sebastián Lobato Pozo, the project's authors. Contact: u202220528@upc.edu.pe."],
      ["Changes to this policy", "Last updated: November 22, 2026. If the policy changes, we will publish the new version here with a new date."]
    ]
  }
};

function text(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

test.afterEach(() => i18n.use("es"));

for (const language of ["es", "en"]) {
  test(`the privacy view renders its heading, nine rows and back button in ${language}`, () => {
    i18n.use(language);
    const html = privacyUi.view();
    const copy = COPY[language];
    assert.equal(text(html), ["← " + copy.back, copy.heading, ...copy.rows.flat()].join(" "));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<h2\b/g) || []).length, 9);
    assert.equal((html.match(/class="privacy-check/g) || []).length, 9);
    assert.match(html, /data-action="privacy-close"/);
    assert.doesNotMatch(html, /data-enter/);
  });
}

test("the privacy view keeps the policy wording in the catalog, one entry per language", () => {
  const keys = ["heading", "send", "sendBody", "store", "storeBody", "account", "accountBody", "survey", "surveyBody", "hosting", "hostingBody",
    "retention", "retentionBody", "rights", "rightsBody", "contact", "contactBody", "changes", "changesBody", "back"];
  for (const language of ["es", "en"]) {
    keys.forEach((key) => assert.notEqual(i18n.message("privacy." + key, language), "privacy." + key));
  }
  assert.equal(i18n.message("privacy.title", "es"), "privacy.title");
});

test("the privacy view names the contact email and the Azure hosting provider in both languages", () => {
  for (const language of ["es", "en"]) {
    i18n.use(language);
    const html = privacyUi.view();
    assert.equal((html.match(/u202220528@upc\.edu\.pe/g) || []).length, 2);
    assert.match(html, /Microsoft Azure/);
    assert.match(html, /Andrés Torres García/);
    assert.match(html, /Sebastián Lobato Pozo/);
  }
});

test("the privacy view discloses the anonymous survey and the last update date in both languages", () => {
  const expected = {
    es: [/sin tu usuario ni ningún vínculo con tu cuenta/, /Última actualización: 22 de noviembre de 2026\./],
    en: [/without your username or any link to your account/, /Last updated: November 22, 2026\./]
  };
  for (const language of ["es", "en"]) {
    i18n.use(language);
    const html = privacyUi.view();
    expected[language].forEach((pattern) => assert.match(html, pattern));
  }
});

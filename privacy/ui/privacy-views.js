/* Privacy · presentational view: the policy as nine short rows inside the
   popup, with a back button. Classic script that registers Sereno.privacyUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;

  var ROWS = ["send", "store", "account", "survey", "hosting", "retention", "rights", "contact", "changes"];
  var messages = {
    heading: ["Política de privacidad de Sereno", "Sereno privacy policy"],
    back: ["Volver al inicio", "Back to home"],
    send: ["Qué enviamos", "What we send"],
    sendBody: ["La dirección de la pestaña actual, cifrada por HTTPS, solo para evaluarla.", "The current tab's address, encrypted via HTTPS, only to evaluate it."],
    store: ["Qué guardamos", "What we store"],
    storeBody: ["Solo el hash y el dominio de cada URL. La dirección completa se procesa en memoria y no se conserva.", "Only the hash and domain of each URL. The full address is processed in memory and is not retained."],
    account: ["Tu cuenta", "Your account"],
    accountBody: ["Si creas una cuenta, guardamos tu usuario y el hash de tu contraseña, y tus consultas quedan vinculadas a ella para mostrarte tu historial. Sin cuenta, las consultas no se vinculan a nadie. No pedimos correo.", "If you create an account, we store your username and password hash, and your queries are linked to it to show you your history. Without an account, queries are not linked to anyone. We do not ask for an email address."],
    survey: ["Encuesta de opinión", "Feedback survey"],
    surveyBody: ["Si tienes una cuenta, el menú de tu cuenta ofrece una encuesta opcional de 10 preguntas (escala SUS) hasta que la respondes. Guardamos tus 10 respuestas, del 1 al 5, y la fecha de envío, sin tu usuario ni ningún vínculo con tu cuenta. Aparte, registramos que tu cuenta participó, solo para evitar envíos repetidos. Mientras respondes, el borrador queda solo en tu navegador.", "If you have an account, your account menu offers an optional 10-question survey (SUS scale) until you answer it. We store your 10 answers, from 1 to 5, and the submission date, without your username or any link to your account. Separately, we record that your account took part, only to prevent repeat submissions. While you answer, the draft stays only in your browser."],
    hosting: ["Dónde se alojan", "Where it is hosted"],
    hostingBody: ["En Microsoft Azure, que actúa solo como proveedor de alojamiento e infraestructura. No vendemos tus datos ni los compartimos con nadie más.", "On Microsoft Azure, which acts only as the hosting and infrastructure provider. We do not sell your data or share it with anyone else."],
    retention: ["Cuánto tiempo los guardamos", "How long we keep it"],
    retentionBody: ["Mientras el servicio esté activo y los datos sean necesarios para detectar phishing. Los veredictos en caché caducan solos: por defecto, a los 7 días los de phishing y a las 24 horas los legítimos.", "While the service is active and the data is needed to detect phishing. Cached verdicts expire on their own: by default, after 7 days for phishing and 24 hours for legitimate sites."],
    rights: ["Tus derechos", "Your rights"],
    rightsBody: ["Puedes borrar tu historial en cualquier momento desde el popup: tus consultas dejan de estar vinculadas a tu cuenta. Para pedir que eliminemos tus datos, escribe a u202220528@upc.edu.pe.", "You can delete your history at any time from the popup: your queries are no longer linked to your account. To ask us to delete your data, write to u202220528@upc.edu.pe."],
    contact: ["Responsables", "Data controllers"],
    contactBody: ["Andrés Torres García y Sebastián Lobato Pozo, autores del proyecto. Contacto: u202220528@upc.edu.pe.", "Andrés Torres García and Sebastián Lobato Pozo, the project's authors. Contact: u202220528@upc.edu.pe."],
    changes: ["Cambios en esta política", "Changes to this policy"],
    changesBody: ["Última actualización: 22 de noviembre de 2026. Si la política cambia, publicaremos la nueva versión aquí con una nueva fecha.", "Last updated: November 22, 2026. If the policy changes, we will publish the new version here with a new date."]
  };
  if (Sereno.i18n && Sereno.i18n.register) {
    var catalog = {};
    Object.keys(messages).forEach(function (key) { catalog["privacy." + key] = { es: messages[key][0], en: messages[key][1] }; });
    Sereno.i18n.register(catalog);
  }
  function t(key) { return Sereno.i18n && Sereno.i18n.t ? Sereno.i18n.t("privacy." + key) : messages[key][0]; }

  function row(key) {
    return (
      '<div class="privacy-row">' + ui.icon("ok", "privacy-check") +
      '<div class="privacy-text"><h2 class="privacy-item-title">' + ui.esc(t(key)) + "</h2>" +
      '<p class="privacy-item-body">' + ui.esc(t(key + "Body")) + "</p></div></div>"
    );
  }

  function view() {
    return (
      '<section class="view view-privacy">' +
      '<button type="button" class="back-link" data-action="privacy-close">← ' + t("back") + "</button>" +
      '<article class="privacy-card" aria-labelledby="privacy-title">' +
      '<header class="privacy-head">' + ui.logo("privacy-logo", "") +
      '<h1 class="privacy-title" id="privacy-title">' + ui.esc(t("heading")) + "</h1></header>" +
      '<div class="privacy-rows">' + ROWS.map(row).join("") + "</div></article></section>"
    );
  }

  Sereno.privacyUi = { view: view };
})(globalThis.Sereno = globalThis.Sereno || {});

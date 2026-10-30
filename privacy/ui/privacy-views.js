/* Privacy · presentational view: the policy as four short rows inside the
   popup, with a back button. Classic script that registers Sereno.privacyUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;

  var ROWS = ["send", "store", "account", "rights"];
  var messages = {
    heading: ["Política de privacidad de Sereno", "Sereno privacy policy"],
    back: ["Volver al inicio", "Back to home"],
    send: ["Qué enviamos", "What we send"],
    sendBody: ["La dirección de la pestaña actual, cifrada por HTTPS, solo para evaluarla.", "The current tab's address, encrypted via HTTPS, only to evaluate it."],
    store: ["Qué guardamos", "What we store"],
    storeBody: ["Solo el hash y el dominio de cada URL. La dirección completa se procesa en memoria y no se conserva.", "Only the hash and domain of each URL. The full address is processed in memory and is not retained."],
    account: ["Tu cuenta", "Your account"],
    accountBody: ["Si creas una cuenta, guardamos tu usuario y el hash de tu contraseña. No pedimos correo.", "If you create an account, we store your username and password hash. We do not ask for an email address."],
    rights: ["Tus derechos", "Your rights"],
    rightsBody: ["Puedes borrar tu historial en cualquier momento desde el popup.", "You can delete your history at any time from the popup."]
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

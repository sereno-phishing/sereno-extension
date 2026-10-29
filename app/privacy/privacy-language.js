(function () {
  "use strict";
  var i18n = Sereno.i18n;
  i18n.register({
    "privacy.title": { es: "Sereno — Política de privacidad", en: "Sereno — Privacy policy" },
    "privacy.heading": { es: "Política de privacidad de Sereno", en: "Sereno privacy policy" },
    "privacy.send": { es: "Qué enviamos", en: "What we send" },
    "privacy.sendBody": { es: "La dirección de la pestaña actual, cifrada por HTTPS, solo para evaluarla.", en: "The current tab's address, encrypted via HTTPS, only to evaluate it." },
    "privacy.store": { es: "Qué guardamos", en: "What we store" },
    "privacy.storeBody": { es: "Solo el hash y el dominio de cada URL. La dirección completa se procesa en memoria y no se conserva.", en: "Only the hash and domain of each URL. The full address is processed in memory and is not retained." },
    "privacy.account": { es: "Tu cuenta", en: "Your account" },
    "privacy.accountBody": { es: "Si creas una cuenta, guardamos tu usuario y el hash de tu contraseña. No pedimos correo.", en: "If you create an account, we store your username and password hash. We do not ask for an email address." },
    "privacy.rights": { es: "Tus derechos", en: "Your rights" },
    "privacy.rightsBody": { es: "Puedes borrar tu historial en cualquier momento desde el popup.", en: "You can delete your history at any time from the popup." }
  });
  var language = i18n.create(Sereno.storage.detect(), typeof navigator !== "undefined" ? navigator.language : "es");
  function render(value) {
    i18n.use(value);
    document.documentElement.lang = value;
    document.querySelectorAll("[data-i18n]").forEach(function (node) { node.textContent = i18n.t(node.getAttribute("data-i18n")); });
  }
  language.subscribe(render);
  render(language.get());
  language.ready().then(render).catch(function () { render(language.get()); });
})();

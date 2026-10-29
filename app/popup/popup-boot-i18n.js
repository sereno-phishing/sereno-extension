/* Localize the loading status without replacing the popup or moving focus. */
(function (Sereno) {
  "use strict";
  var copy = { es: "Cargando Sereno...", en: "Loading Sereno..." };
  function show(language) {
    var skeleton = document.querySelector("#app .boot-skeleton");
    if (!skeleton) return;
    var label = skeleton.querySelector(".boot-skeleton-label");
    if (!label) return;
    var selected = language === "en" ? "en" : "es";
    skeleton.lang = selected;
    label.textContent = copy[selected];
  }
  if (!Sereno.i18n || !Sereno.storage) {
    show("es");
    return;
  }
  try {
    var browserLanguage = typeof navigator === "undefined" ? "es" : navigator.language;
    var language = Sereno.i18n.create(Sereno.storage.detect(), browserLanguage);
    show(language.get());
    language.subscribe(show);
    language.ready().then(show).catch(function () { show(language.get()); });
  } catch (error) {
    show("es");
  }
})(globalThis.Sereno = globalThis.Sereno || {});

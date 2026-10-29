(function () {
  "use strict";
  var i18n = Sereno.i18n;
  i18n.register({
    "demo.title": { es: "Tienda de demo — Sereno", en: "Demo store — Sereno" },
    "demo.heading": { es: "Tienda de demo de Sereno", en: "Sereno demo store" },
    "demo.panel": { es: "Simulador de demo", en: "Demo simulator" },
    "demo.subtitle": { es: "Así se ve Sereno en una tienda real.", en: "This is how Sereno looks in a real store." },
    "demo.safe": { es: "Sitio seguro", en: "Safe site" },
    "demo.warning": { es: "Advertencia", en: "Warning" },
    "demo.block": { es: "Bloqueo", en: "Blocked" },
    "demo.pending": { es: "Pendiente", en: "Pending" },
    "demo.tooltip": { es: "Sereno: sitio seguro", en: "Sereno: safe site" },
    "demo.pendingTitle": { es: "Evaluación pendiente", en: "Evaluation pending" },
    "demo.pendingBody": { es: "Aún no pudimos revisar este sitio. Evita ingresar datos de pago hasta que termine.", en: "We could not review this site yet. Avoid entering payment details until the review is complete." },
    "demo.retry": { es: "Reintentando automáticamente...", en: "Retrying automatically..." },
    "demo.accounts": { es: "Cuentas demo: andres.torres · admin.sereno / sereno123", en: "Demo accounts: andres.torres · admin.sereno / sereno123" }
  });
  var language = i18n.create(Sereno.storage.detect(), typeof navigator !== "undefined" ? navigator.language : "es");
  function render(value) {
    i18n.use(value);
    document.documentElement.lang = value;
    document.querySelectorAll("[data-i18n]").forEach(function (node) { node.textContent = i18n.t(node.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) { node.setAttribute("aria-label", i18n.t(node.getAttribute("data-i18n-aria"))); });
    if (Sereno.verdictModal && Sereno.verdictModal.translate) Sereno.verdictModal.translate(document);
  }
  language.subscribe(render);
  render(language.get());
  language.ready().then(render).catch(function () { render(language.get()); });
})();

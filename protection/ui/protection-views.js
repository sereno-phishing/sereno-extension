/* Protection · presentational views: protection card, current-site card,
   toolbar icon legend, model-updated notice and model version label.
   Classic script that registers Sereno.protectionUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var verdictUi = Sereno.verdictUi;
  var protection = Sereno.protection;

  /* Toolbar icon states and the dot colour of each. */
  var ICON_STATES = [
    { color: "green", label: "Activa" },
    { color: "grey", label: "Inactiva" },
    { color: "amber", label: "Sin conexión" }
  ];

  function protectionCard() {
    return (
      '<div class="protection-card">' + ui.art("ok", "36") +
      '<div class="protection-text"><div class="protection-title">Protección activa</div>' +
      '<div class="protection-sub">Modo por defecto: Advertencia</div></div>' +
      "</div>"
    );
  }

  function siteCard(site) {
    var current = site || {};
    return (
      '<div class="site-card"><div class="site-label">Este sitio</div>' +
      '<div class="site-row"><div class="site-domain">' + ui.esc(current.domain) + "</div>" +
      verdictUi.pill(current.status, "md") + "</div></div>"
    );
  }

  function iconLegend() {
    return (
      '<div class="icon-legend"><div class="legend-title">Estados del ícono</div>' +
      '<div class="legend-items">' +
      ICON_STATES.map(function (state) {
        return ui.legendItem(ui.art("dot-" + state.color, "10"), state.label);
      }).join("") +
      "</div></div>"
    );
  }

  function modelNotice() {
    return (
      '<button type="button" class="notice-card" data-action="dismiss-notice">' + ui.art("brand", "28") +
      '<span class="notice-body">' +
      '<span class="notice-title">Modelo actualizado a v' + protection.UPDATED_MODEL_VERSION + "</span>" +
      '<span class="notice-text">Se actualizó en el servidor. No tienes que reinstalar nada.</span>' +
      "</span></button>"
    );
  }

  /* state: the shared state; the label highlights a freshly updated model. */
  function modelVersionLabel(state) {
    return (
      '<span class="' + ui.classes(["footer-model", protection.isNoticeVisible(state) && "is-updated"]) + '">Modelo v' +
      protection.modelVersion(state) + "</span>"
    );
  }

  Sereno.protectionUi = {
    protectionCard: protectionCard,
    siteCard: siteCard,
    iconLegend: iconLegend,
    modelNotice: modelNotice,
    modelVersionLabel: modelVersionLabel
  };
})(globalThis.Sereno = globalThis.Sereno || {});

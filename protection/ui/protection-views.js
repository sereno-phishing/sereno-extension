/* Protection · presentational views: protection card, current-site card,
   toolbar icon legend, model-updated notice and model version label.
   Classic script that registers Sereno.protectionUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var verdictUi = Sereno.verdictUi;
  var protection = Sereno.protection;
  var outcomes = Sereno.verdictOutcome;
  var verdict = Sereno.verdict;

  /* Toolbar icon states and the dot colour of each. */
  var ICON_STATES = [
    { color: "green", label: "Activa" },
    { color: "grey", label: "Inactiva" },
    { color: "amber", label: "Sin conexión" }
  ];

  /* level: "active" (default) or "degraded" (HU-26); reason: optional
     outcome reason that explains the degraded state. */
  function protectionCard(level, reason) {
    if (level === "degraded") {
      var notice = outcomes.notice(outcomes.degraded(reason));
      return (
        '<div class="protection-card is-degraded" role="status">' + ui.art("warn", "36") +
        '<div class="protection-text"><div class="protection-title">' + ui.esc(notice.title) + "</div>" +
        '<div class="protection-sub">' + ui.esc(reason ? notice.text : "Algunas comprobaciones no están disponibles.") + "</div></div>" +
        "</div>"
      );
    }
    return (
      '<div class="protection-card" role="status">' + ui.art("ok", "36") +
      '<div class="protection-text"><div class="protection-title">Protección activa</div>' +
      '<div class="protection-sub">Modo por defecto: Advertencia</div></div>' +
      "</div>"
    );
  }

  /* level: "degraded" when the verdict service is down (HU-26). A status that
     is still being evaluated is marked busy and announced; a degraded level
     explains that the site could not be checked. */
  function siteCard(site, level) {
    var current = site || {};
    var pending = verdict.status(current.status).tone === "neutral";
    var degraded = level === "degraded";
    var live = pending || degraded;
    return (
      '<div class="' + ui.classes(["site-card", degraded ? "is-degraded" : pending && "is-pending"]) + '"' +
      (live ? ' role="status"' : "") + (pending && !degraded ? ' aria-busy="true"' : "") + ">" +
      '<div class="site-label">Este sitio</div>' +
      '<div class="site-row"><div class="site-domain">' + ui.esc(current.domain) + "</div>" +
      verdictUi.pill(current.status, "md") + "</div>" +
      (degraded ? '<div class="site-note">No se pudo comprobar este sitio. Evita ingresar datos de pago.</div>' : "") +
      "</div>"
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

  function modelNotice(version) {
    return (
      '<button type="button" class="notice-card" data-action="dismiss-notice">' + ui.art("brand", "28") +
      '<span class="notice-body">' +
      '<span class="notice-title">Modelo actualizado a v' + ui.esc(version) + "</span>" +
      '<span class="notice-text">Se actualizó en el servidor. No tienes que reinstalar nada.</span>' +
      "</span></button>"
    );
  }

  /* state: the shared state; version: what the backend reported (null while
     unknown, then only "Modelo" shows). The label highlights a fresh update. */
  function modelVersionLabel(state, version) {
    return (
      '<span class="' + ui.classes(["footer-model", version && protection.isNoticeVisible(state) && "is-updated"]) + '">Modelo' +
      (version ? " v" + ui.esc(version) : "") + "</span>"
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

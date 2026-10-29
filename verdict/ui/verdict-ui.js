/* Verdict · presentational pieces every surface uses to show a status: tone
   colours, badges, pills, the toolbar badge and the verdict fact labels.
   Classic script that registers Sereno.verdictUi. Depends on Sereno.verdict
   and the Sereno.ui atoms; returns plain data or HTML strings. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var verdict = Sereno.verdict;

  var TONE_COLORS = { ok: "green", warn: "amber", bad: "red", neutral: "grey" };

  /* Toolbar badge background per tone. */
  var BADGE_COLORS = { ok: "#16A34A", warn: "#D97706", bad: "#DC2626", neutral: "#6B7280" };

  /* Labels of the verdict facts shown in the popup detail and the demo modals. */
  var FACT_LABELS = {
    risk: "Nivel de riesgo",
    score: "Score del modelo",
    date: "Fecha de clasificación",
    source: "Fuente del veredicto"
  };

  if (Sereno.i18n) Sereno.i18n.register({
    "verdict.status.seguro": { es: "Seguro", en: "Safe" },
    "verdict.status.advertencia": { es: "Advertencia", en: "Warning" },
    "verdict.status.bloqueo": { es: "Bloqueado", en: "Blocked" },
    "verdict.status.pendiente": { es: "Evaluando…", en: "Checking…" },
    "verdict.fact.risk": { es: FACT_LABELS.risk, en: "Risk level" },
    "verdict.fact.score": { es: FACT_LABELS.score, en: "Model score" },
    "verdict.fact.date": { es: FACT_LABELS.date, en: "Classification date" },
    "verdict.fact.source": { es: FACT_LABELS.source, en: "Verdict source" }
  });
  if (Sereno.i18n) Object.keys(FACT_LABELS).forEach(function (key) {
    Object.defineProperty(FACT_LABELS, key, { enumerable: true, get: function () { return Sereno.i18n.t("verdict.fact." + key); } });
  });
  function statusLabel(status) {
    return Sereno.i18n ? Sereno.i18n.t("verdict.status." + status.id) : status.label;
  }

  function toneColor(tone) {
    return TONE_COLORS[tone];
  }

  /* Status artwork; the pending status has no artwork and shows its glyph. */
  function badge(statusId, size) {
    var status = verdict.status(statusId);
    if (status.tone === "neutral") {
      return '<span class="art-glyph art-' + size + '" aria-hidden="true">' + status.glyph + "</span>";
    }
    return ui.art(status.tone, size);
  }

  /* Popup pill: badge + label, size "sm" or "md". */
  function pill(statusId, size) {
    var status = verdict.status(statusId);
    return ui.pill(
      "pill-" + size + " pill-" + status.tone,
      badge(statusId, size === "sm" ? "12" : "14") + "<span>" + ui.esc(statusLabel(status)) + "</span>"
    );
  }

  /* Admin panel pill. */
  function adminPill(statusId) {
    var status = verdict.status(statusId);
    return ui.pill("pill-" + status.id, ui.icon("admin-pill-" + status.tone, "pill-img") + ui.esc(statusLabel(status)));
  }

  /* Small admin-panel dot for a tone. */
  function adminDot(tone) {
    return ui.icon("admin-dot-" + toneColor(tone), "dot");
  }

  /* Text and colour of the extension toolbar badge for a status. */
  function toolbarBadge(statusId) {
    var status = verdict.status(statusId);
    return { text: status.tone === "neutral" ? "…" : status.glyph, color: BADGE_COLORS[status.tone] };
  }

  Sereno.verdictUi = {
    FACT_LABELS: FACT_LABELS,
    toneColor: toneColor,
    badge: badge,
    pill: pill,
    adminPill: adminPill,
    adminDot: adminDot,
    toolbarBadge: toolbarBadge
  };
})(globalThis.Sereno = globalThis.Sereno || {});

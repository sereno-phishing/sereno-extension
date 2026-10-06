/* Verdict: the status catalog every surface shares (popup, admin panel, demo
   store) plus the derived risk level and source labels. Classic script that
   registers Sereno.verdict. Pure: no DOM, no storage. */

(function (Sereno) {
  "use strict";

  /* tone is the visual family the UI maps to colours and icons. */
  var STATUSES = {
    seguro: { id: "seguro", label: "Seguro", title: "Sitio seguro", glyph: "✓", tone: "ok" },
    advertencia: { id: "advertencia", label: "Advertencia", title: "Advertencia", glyph: "!", tone: "warn" },
    bloqueo: { id: "bloqueo", label: "Bloqueado", title: "Sitio bloqueado", glyph: "✕", tone: "bad" },
    pendiente: { id: "pendiente", label: "Evaluando…", title: "Evaluación pendiente", glyph: "◔", tone: "neutral" }
  };

  /* Final verdicts, in display order. */
  var VERDICTS = ["seguro", "advertencia", "bloqueo"];

  /* A warning at or above this score is reported as high risk. */
  var HIGH_RISK_SCORE = 0.85;

  /* Any unknown status (for example "evaluando") reads as pending. */
  function status(id) {
    return STATUSES[id] || STATUSES.pendiente;
  }

  function riskLevel(entry) {
    if (entry.status === "bloqueo") {
      return "Alto";
    }
    if (entry.status === "advertencia") {
      return entry.score >= HIGH_RISK_SCORE ? "Alto" : "Medio";
    }
    if (entry.status === "seguro") {
      return "Bajo";
    }
    return "—";
  }

  function sourceLabel(source) {
    return source === "cache" ? "Caché" : "Modelo";
  }

  /* Model score as a 0..100 integer for score bars. */
  function scorePercent(score) {
    return Math.max(0, Math.min(100, Math.round((Number(score) || 0) * 100)));
  }

  Sereno.verdict = {
    STATUSES: STATUSES,
    VERDICTS: VERDICTS,
    HIGH_RISK_SCORE: HIGH_RISK_SCORE,
    status: status,
    riskLevel: riskLevel,
    sourceLabel: sourceLabel,
    scorePercent: scorePercent
  };
})(globalThis.Sereno = globalThis.Sereno || {});

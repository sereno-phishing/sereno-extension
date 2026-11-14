/* Verdict: the status catalog every surface shares (popup, admin panel,
   in-page overlay) plus the derived risk level and source labels. Classic script that
   registers Sereno.verdict. Pure: no DOM, no storage.

   The backend answers the two-class model verdict ("phishing" | "legitima")
   and the response policy of the domain ("advertencia" | "bloqueo"). The
   extension applies that policy (RF-10) in applyPolicy, the only place that
   turns both into one of the three final statuses; everything past the
   provider boundary works on statuses. */

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

  /* The classes the model answers, as the backend spells them. */
  var MODEL_VERDICTS = {
    phishing: { id: "phishing", label: "Phishing" },
    legitima: { id: "legitima", label: "Legítimo" }
  };

  /* What the extension does with a phishing verdict; set per domain. */
  var POLICIES = ["advertencia", "bloqueo"];

  /* A warning at or above this score is reported as high risk. */
  var HIGH_RISK_SCORE = 0.85;

  /* Any unknown status (for example "evaluando") reads as pending. */
  function status(id) {
    return STATUSES[id] || STATUSES.pendiente;
  }

  /* The model class entry, or null for anything the model does not answer. */
  function modelVerdict(id) {
    return Object.prototype.hasOwnProperty.call(MODEL_VERDICTS, id) ? MODEL_VERDICTS[id] : null;
  }

  /* Final status for a model verdict under the domain policy: a legitimate
     site is safe, a phishing site gets what the policy asks for. Null when
     either value is outside the contract; callers treat that as a server
     failure, never as a verdict. */
  function applyPolicy(modelVerdictId, policy) {
    if (modelVerdictId === MODEL_VERDICTS.legitima.id) {
      return STATUSES.seguro.id;
    }
    if (modelVerdictId === MODEL_VERDICTS.phishing.id && POLICIES.indexOf(policy) >= 0) {
      return policy;
    }
    return null;
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
    MODEL_VERDICTS: MODEL_VERDICTS,
    POLICIES: POLICIES,
    HIGH_RISK_SCORE: HIGH_RISK_SCORE,
    status: status,
    modelVerdict: modelVerdict,
    applyPolicy: applyPolicy,
    riskLevel: riskLevel,
    sourceLabel: sourceLabel,
    scorePercent: scorePercent
  };
})(globalThis.Sereno = globalThis.Sereno || {});

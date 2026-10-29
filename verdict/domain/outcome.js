/* Verdict · outcome model: the one normalized result every caller (service
   worker, popup, demo store) gets from the verdict use case. Classic script
   that registers Sereno.verdictOutcome. Pure: no DOM, no storage, no network.
     { kind: "verdict",  verdict: { domain, status, score, source, latencyMs } }
     { kind: "pending",  reason: "evaluating" }
     { kind: "degraded", reason: "offline" | "timeout" | "server" | "cache_down" }
   Statuses come from Sereno.verdict; there is no second catalog.

   FAIL-OPEN DECISION: a degraded outcome never blocks the user. Blocking a
   page needs a real "bloqueo" verdict; when the backend, the network or the
   verdict cache fail, the page loads, protection is reported as "degraded"
   and the user sees a warning (HU-26). Blocking on an outage would lock people
   out of legitimate e-commerce sites whenever the service is down. */

(function (Sereno) {
  "use strict";

  var verdict = Sereno.verdict;

  var REASONS = ["offline", "timeout", "server", "cache_down"];
  var PENDING_REASON = "evaluating";

  /* "Evaluando…" appears only when the wait is noticeable (HU-25); fast
     answers go straight to the final status without a flicker. */
  var PENDING_AFTER_MS = 300;

  var NOTICE_TITLE = "Protección degradada";
  var NOTICE_TEXTS = {
    offline: "Sin conexión: no se pudo evaluar el sitio. Puedes continuar con precaución.",
    timeout: "La evaluación tardó demasiado tiempo. Puedes continuar con precaución.",
    server: "El servidor de Sereno no respondió bien. Puedes continuar con precaución.",
    cache_down: "El caché de veredictos no está disponible. Puedes continuar con precaución."
  };

  function degraded(reason) {
    return { kind: "degraded", reason: REASONS.indexOf(reason) >= 0 ? reason : "server" };
  }

  function pending() {
    return { kind: "pending", reason: PENDING_REASON };
  }

  /* Maps a provider port result (or anything else it returned) to an outcome. */
  function fromResult(result) {
    if (!result || typeof result !== "object") {
      return degraded("server");
    }
    if (result.ok === true) {
      if (verdict.VERDICTS.indexOf(result.status) < 0) {
        return degraded("server");
      }
      return {
        kind: "verdict",
        verdict: {
          domain: result.domain,
          status: result.status,
          score: result.score,
          source: result.source,
          latencyMs: result.latencyMs
        }
      };
    }
    return degraded(result.error);
  }

  function shouldShowPending(elapsedMs) {
    return elapsedMs >= PENDING_AFTER_MS;
  }

  /* Status id to display: only a final verdict has its own; everything else
     reads as the existing pending status. */
  function statusId(outcome) {
    return outcome && outcome.kind === "verdict" ? outcome.verdict.status : "pendiente";
  }

  /* Anything that is not a clean verdict or a pending wait means the
     protection cannot do its full job right now. */
  function protectionLevel(outcome) {
    if (outcome && (outcome.kind === "verdict" || outcome.kind === "pending")) {
      return "active";
    }
    return "degraded";
  }

  /* Fail-open: only an actual block verdict stops navigation. */
  function blocksNavigation(outcome) {
    return !!outcome && outcome.kind === "verdict" && outcome.verdict.status === "bloqueo";
  }

  /* Title and text of the degraded warning, null when protection is fine. */
  if (Sereno.i18n) {
    Sereno.i18n.register({
      "notice.title": { es: NOTICE_TITLE, en: "Protection degraded" },
      "notice.offline": { es: NOTICE_TEXTS.offline, en: "Offline: this site could not be checked. You can continue with caution." },
      "notice.timeout": { es: NOTICE_TEXTS.timeout, en: "The evaluation took too long. You can continue with caution." },
      "notice.server": { es: NOTICE_TEXTS.server, en: "The Sereno server did not respond properly. You can continue with caution." },
      "notice.cache_down": { es: NOTICE_TEXTS.cache_down, en: "The verdict cache is unavailable. You can continue with caution." }
    });
  }

  function notice(outcome) {
    if (!outcome || outcome.kind !== "degraded") {
      return null;
    }
    var reason = degraded(outcome.reason).reason;
    return Sereno.i18n ? { title: Sereno.i18n.t("notice.title"), text: Sereno.i18n.t("notice." + reason) } :
      { title: NOTICE_TITLE, text: NOTICE_TEXTS[reason] };
  }

  function domainOf(url) {
    var text = String(url || "").trim();
    var host;
    try {
      host = new URL(text).hostname;
    } catch (error) {
      host = text;
    }
    return host.toLowerCase().replace(/^www\./, "");
  }

  /* The currentSite shape (see platform/seed.js) for an outcome. */
  function siteOf(outcome, url, stamp) {
    if (outcome && outcome.kind === "verdict") {
      var found = outcome.verdict;
      return { domain: found.domain, status: found.status, score: found.score, source: found.source, ts: stamp };
    }
    return { domain: domainOf(url), status: "evaluando", score: null, source: null, ts: stamp };
  }

  Sereno.verdictOutcome = {
    REASONS: REASONS,
    PENDING_AFTER_MS: PENDING_AFTER_MS,
    NOTICE_TITLE: NOTICE_TITLE,
    degraded: degraded,
    pending: pending,
    fromResult: fromResult,
    shouldShowPending: shouldShowPending,
    statusId: statusId,
    protectionLevel: protectionLevel,
    blocksNavigation: blocksNavigation,
    notice: notice,
    domainOf: domainOf,
    siteOf: siteOf
  };
})(globalThis.Sereno = globalThis.Sereno || {});

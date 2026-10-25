/* Protection: the status of the current site and the model version notice.
   Classic script that registers Sereno.protection. Pure. */

(function (Sereno) {
  "use strict";

  var MODEL_VERSION = "1.2";
  var UPDATED_MODEL_VERSION = "1.3";

  /* Signed-in users see the "model updated" notice until they dismiss it. */
  function isNoticeVisible(state) {
    return !!(state.session && !state.modelNoticeDismissed);
  }

  function modelVersion(state) {
    return isNoticeVisible(state) ? UPDATED_MODEL_VERSION : MODEL_VERSION;
  }

  /* Placeholder site shown while a verdict is being computed. */
  function evaluatingSite(domain, stamp) {
    return { domain: domain, status: "evaluando", score: null, source: null, ts: stamp };
  }

  /* "degraded" when the verdict backend or its cache is unavailable (HU-26);
     the verdict service publishes it as state.protectionLevel. Anything else,
     including a state saved before this field existed, reads as "active". */
  function levelOf(state) {
    return state && state.protectionLevel === "degraded" ? "degraded" : "active";
  }

  function isDegraded(state) {
    return levelOf(state) === "degraded";
  }

  Sereno.protection = {
    levelOf: levelOf,
    isDegraded: isDegraded,
    MODEL_VERSION: MODEL_VERSION,
    UPDATED_MODEL_VERSION: UPDATED_MODEL_VERSION,
    isNoticeVisible: isNoticeVisible,
    modelVersion: modelVersion,
    evaluatingSite: evaluatingSite
  };
})(globalThis.Sereno = globalThis.Sereno || {});

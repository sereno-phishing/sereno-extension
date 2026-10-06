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

  Sereno.protection = {
    MODEL_VERSION: MODEL_VERSION,
    UPDATED_MODEL_VERSION: UPDATED_MODEL_VERSION,
    isNoticeVisible: isNoticeVisible,
    modelVersion: modelVersion,
    evaluatingSite: evaluatingSite
  };
})(globalThis.Sereno = globalThis.Sereno || {});

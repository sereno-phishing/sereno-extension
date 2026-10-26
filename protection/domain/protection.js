/* Protection: the status of the current site and the model update notice.
   Classic script that registers Sereno.protection. Pure. */

(function (Sereno) {
  "use strict";

  /* The "model updated" notice is data driven. A signed-in user sees it when
     the backend reports a version other than the last one they saw
     (state.lastSeenModelVersion); dismissing stores the reported version.
     States saved before that field existed carry the boolean
     modelNoticeDismissed: when it is true the notice stays hidden. Without a
     backend version there is nothing to announce. */
  function isNoticeVisible(state, backendVersion) {
    if (!state || !state.session || !backendVersion || state.modelNoticeDismissed === true) {
      return false;
    }
    return state.lastSeenModelVersion !== backendVersion;
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
    isNoticeVisible: isNoticeVisible,
    evaluatingSite: evaluatingSite
  };
})(globalThis.Sereno = globalThis.Sereno || {});

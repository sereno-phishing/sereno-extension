/* Protection · use cases. Classic script that registers Sereno.protectionService.
   showSite and dismissModelNotice only touch the local UI state.
   loadModelVersion is async, never throws and asks the data port which model
   the backend runs (HU-27). -> { ok: true, version } or
   { ok: false, error, message } (Sereno.providers.errors.CODES). */

(function (Sereno) {
  "use strict";

  function failure(error) {
    return Sereno.providers.errors.failure(error);
  }

  /* Publishes the status of the site in the active tab to every page. */
  function showSite(store, site) {
    return store.set({ currentSite: site });
  }

  /* Remembers the model version the user has now seen. The old boolean is
     cleared so later backend versions announce themselves again. */
  function dismissModelNotice(store, version) {
    if (typeof version !== "string" || !version) {
      return Promise.resolve();
    }
    return store.set({ lastSeenModelVersion: version, modelNoticeDismissed: false });
  }

  async function loadModelVersion(services) {
    try {
      var answer = await services.data.getModelVersion();
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      if (typeof answer.version !== "string" || !answer.version) {
        return failure("server");
      }
      return { ok: true, version: answer.version };
    } catch (error) {
      return failure("server");
    }
  }

  Sereno.protectionService = {
    showSite: showSite,
    dismissModelNotice: dismissModelNotice,
    loadModelVersion: loadModelVersion
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Protection · use cases. Classic script that registers Sereno.protectionService. */

(function (Sereno) {
  "use strict";

  /* Publishes the status of the site in the active tab to every page. */
  function showSite(store, site) {
    return store.set({ currentSite: site });
  }

  function dismissModelNotice(store) {
    return store.set({ modelNoticeDismissed: true });
  }

  Sereno.protectionService = {
    showSite: showSite,
    dismissModelNotice: dismissModelNotice
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Administration · use cases for the per-domain policy and the verdict cache.
   Classic script that registers Sereno.administrationService. */

(function (Sereno) {
  "use strict";

  var domainPolicy = Sereno.domainPolicy;
  var verdictCache = Sereno.verdictCache;
  var time = Sereno.time;

  /* Persists one newly added row right away; other draft edits wait for saveDomains. */
  function addDomain(store, row) {
    return store.update(function (state) {
      return { domains: domainPolicy.upsertFirst(state.domains, row) };
    });
  }

  function saveDomains(store, rows) {
    return store.set({ domains: rows });
  }

  function saveTtl(store, rawPhishingDays, rawLegitHours) {
    return store.update(function (state) {
      return { cache: verdictCache.withTtl(state.cache, rawPhishingDays, rawLegitHours) };
    });
  }

  function invalidateDomain(store, domain, now) {
    return store.update(function (state) {
      return { cache: verdictCache.withInvalidation(state.cache, domain, time.formatDate(now)) };
    });
  }

  Sereno.administrationService = {
    addDomain: addDomain,
    saveDomains: saveDomains,
    saveTtl: saveTtl,
    invalidateDomain: invalidateDomain
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Administration · verdict cache: TTL settings and manual invalidations.
   Classic script that registers Sereno.verdictCache. Pure. */

(function (Sereno) {
  "use strict";

  var PENDING_REEVALUATION = "Se reevaluará en la próxima consulta";

  /* A TTL input is accepted only as a positive integer; otherwise null. */
  function parseTtl(raw) {
    var value = parseInt(raw, 10);
    return value > 0 ? value : null;
  }

  /* Returns a new cache with the valid TTL values applied; invalid ones keep the current value. */
  function withTtl(cache, rawPhishingDays, rawLegitHours) {
    var next = Object.assign({}, cache);
    var days = parseTtl(rawPhishingDays);
    var hours = parseTtl(rawLegitHours);
    if (days) {
      next.ttlPhishingDays = days;
    }
    if (hours) {
      next.ttlLegitHours = hours;
    }
    return next;
  }

  /* Adds a pending re-evaluation for the domain at the top of the list. */
  function withInvalidation(cache, domain, dayText) {
    var next = Object.assign({}, cache);
    next.invalidations = [{ domain: domain, status: PENDING_REEVALUATION, date: dayText }].concat(next.invalidations || []);
    return next;
  }

  Sereno.verdictCache = {
    PENDING_REEVALUATION: PENDING_REEVALUATION,
    parseTtl: parseTtl,
    withTtl: withTtl,
    withInvalidation: withInvalidation
  };
})(globalThis.Sereno = globalThis.Sereno || {});

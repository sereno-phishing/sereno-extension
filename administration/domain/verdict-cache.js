/* Administration · verdict cache: TTL settings and manual invalidations.
   Classic script that registers Sereno.verdictCache. Pure.
   A cache entry is { domain, verdict, date }: verdict is the model class the
   domain was re-evaluated to, or null while the re-evaluation is pending.
   Several entries may share a domain. No policy applies here: the cache keeps
   what the model said, not what the user saw. */

(function (Sereno) {
  "use strict";

  var PENDING_REEVALUATION = "Se reevaluará en la próxima consulta";
  var REEVALUATED = "Reevaluado: ";

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
    next.invalidations = [{ domain: domain, verdict: null, date: dayText }].concat(next.invalidations || []);
    return next;
  }

  /* Text of the state column for a cache entry: the model class when the
     entry carries one, the pending text when it carries none. Any other text
     the backend sends is shown as it came. */
  function statusText(entry) {
    var found = Sereno.verdict.modelVerdict(entry.verdict);
    if (found) {
      return REEVALUATED + found.label.toLowerCase();
    }
    return typeof entry.verdict === "string" && entry.verdict ? entry.verdict : PENDING_REEVALUATION;
  }

  Sereno.verdictCache = {
    PENDING_REEVALUATION: PENDING_REEVALUATION,
    parseTtl: parseTtl,
    withTtl: withTtl,
    withInvalidation: withInvalidation,
    statusText: statusText
  };
})(globalThis.Sereno = globalThis.Sereno || {});

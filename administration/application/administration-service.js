/* Administration · use cases for the per-domain policy (HU-21), the verdict
   cache (HU-28) and the operation metrics (HU-29). Classic script that
   registers Sereno.administrationService. Every use case is async, never
   throws, and reads or writes only through the data port (services.data, see
   platform/providers/ports.js); the domain rules (row shape, TTL validation)
   run here on what the port returns. Results: { ok: true, ... } or
   { ok: false, error, message } where error is one of
   Sereno.providers.errors.CODES. */

(function (Sereno) {
  "use strict";

  var domainPolicy = Sereno.domainPolicy;
  var verdictCache = Sereno.verdictCache;

  function failure(error) {
    return Sereno.providers.errors.failure(error);
  }

  function isRow(row) {
    return !!row && typeof row === "object" && typeof row.domain === "string" && typeof row.policy === "string";
  }

  function isCache(cache) {
    return !!cache && typeof cache === "object" && !Array.isArray(cache) && typeof cache.ttlPhishingDays === "number" && typeof cache.ttlLegitHours === "number";
  }

  /* Runs one port call and checks the answer shape; any throw reads as a server failure.
     read(answer) returns the success payload, or null when the shape is wrong. */
  async function call(request, read) {
    try {
      var answer = await request();
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      var payload = read(answer);
      return payload ? Object.assign({ ok: true }, payload) : failure("server");
    } catch (error) {
      return failure("server");
    }
  }

  function readDomains(answer) {
    return Array.isArray(answer.domains) ? { domains: answer.domains.filter(isRow).map(domainPolicy.toRow) } : null;
  }

  function readCache(answer) {
    return isCache(answer.cache) ? { cache: answer.cache } : null;
  }

  function readNothing() {
    return {};
  }

  /* -> { ok: true, domains: [{ domain, policy, updatedAt }] } */
  function loadDomains(services) {
    return call(function () {
      return services.data.getDomainPolicies();
    }, readDomains);
  }

  /* Persists the whole list. -> { ok: true } */
  function saveDomains(services, rows) {
    return call(function () {
      return services.data.putDomainPolicies(rows.map(domainPolicy.toRow));
    }, readNothing);
  }

  /* Persists one newly added row right away (first in the list, replacing a
     listed one); other draft edits wait for saveDomains. -> { ok: true, domains } */
  async function addDomain(services, row) {
    var current = await loadDomains(services);
    if (!current.ok) {
      return current;
    }
    var domains = domainPolicy.upsertFirst(current.domains, row);
    var saved = await saveDomains(services, domains);
    return saved.ok ? { ok: true, domains: domains } : saved;
  }

  /* -> { ok: true, cache: { ttlPhishingDays, ttlLegitHours, invalidations } } */
  function loadCache(services) {
    return call(function () {
      return services.data.getCache();
    }, readCache);
  }

  /* Invalid TTL inputs keep the current value (verdictCache.withTtl); the port
     always receives two positive integers. -> { ok: true, cache } */
  async function saveTtl(services, rawPhishingDays, rawLegitHours) {
    var current = await loadCache(services);
    if (!current.ok) {
      return current;
    }
    var next = verdictCache.withTtl(current.cache, rawPhishingDays, rawLegitHours);
    return call(function () {
      return services.data.setCacheTtl(next.ttlPhishingDays, next.ttlLegitHours);
    }, readCache);
  }

  /* Forces a new evaluation of the domain. -> { ok: true, cache } */
  function invalidateDomain(services, domain) {
    return call(function () {
      return services.data.invalidateCache(domain);
    }, readCache);
  }

  /* -> { ok: true, metrics } in the dashboard shape. */
  function loadMetrics(services) {
    return call(function () {
      return services.data.getMetrics();
    }, function (answer) {
      var metrics = answer.metrics;
      return metrics && typeof metrics === "object" && !Array.isArray(metrics) ? { metrics: metrics } : null;
    });
  }

  Sereno.administrationService = {
    loadDomains: loadDomains,
    saveDomains: saveDomains,
    addDomain: addDomain,
    loadCache: loadCache,
    saveTtl: saveTtl,
    invalidateDomain: invalidateDomain,
    loadMetrics: loadMetrics
  };
})(globalThis.Sereno = globalThis.Sereno || {});

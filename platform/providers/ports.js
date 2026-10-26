/* Platform · port contracts every provider adapter implements. Classic script
   that registers Sereno.providers.ports (the method names, so tests and the
   composition root can check conformance). There is no runtime class: a port
   is the shape documented here.

   Every method is async and never throws. Success resolves { ok: true, ... };
   failure resolves { ok: false, error } where error is one of
     transport  "timeout" | "offline" | "server" | "cache_down"
     domain     "invalid" (login) | "duplicate" (register)

   verdict port
     evaluate(url)            -> { ok, domain, status, score, source, latencyMs }
                                 status: "seguro" | "advertencia" | "bloqueo"
                                 source: "cache" | "modelo"
                                 The backend also records the visit in the signed-in
                                 user's history; clients never write history.

   auth port
     login(username, password)    -> { ok, user: { username, role, createdAt }, token }
     register(username, password) -> { ok, user: { username, role, createdAt }, token }   (signs the new user in)
     logout()                     -> { ok }
     session()                    -> { ok, session: { username, role, loginAt, token? } | null }
     The token is opaque; the backend verifies credentials, clients never do.

   data port (history is scoped to the signed-in user)
     listHistory()                     -> { ok, entries: [{ id, domain, status, score, source, ts, latencyMs }] }
     deleteHistory()                   -> { ok }   (clears the signed-in user's entries)
     getDomainPolicies()               -> { ok, domains: [{ domain, policy, updatedAt }] }
     putDomainPolicies(domains)        -> { ok }   (replaces the whole list)
     getCache()                        -> { ok, cache: { ttlPhishingDays, ttlLegitHours, invalidations: [{ domain, status, date }] } }
     setCacheTtl(phishingDays, legitHours) -> { ok, cache }
     invalidateCache(domain)           -> { ok, cache }
     getMetrics()                      -> { ok, metrics }   (dashboard shape of Sereno.seed.metrics)
     getModelVersion()                 -> { ok, version }
     submitSurvey(answers)             -> { ok }   (answers: ten SUS values, completes the survey) */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};
  Sereno.providers.ports = {
    ERRORS: ["timeout", "offline", "server", "cache_down"],
    METHODS: {
      verdict: ["evaluate"],
      auth: ["login", "register", "logout", "session"],
      data: [
        "listHistory",
        "deleteHistory",
        "getDomainPolicies",
        "putDomainPolicies",
        "getCache",
        "setCacheTtl",
        "invalidateCache",
        "getMetrics",
        "getModelVersion",
        "submitSurvey"
      ]
    }
  };
})(globalThis.Sereno = globalThis.Sereno || {});

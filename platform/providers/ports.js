/* Platform · port contracts the backend adapter implements. Classic script
   that registers Sereno.providers.ports (the method names, so tests and the
   composition root can check conformance). There is no runtime class: a port
   is the shape documented here.

   Every method is async and never throws, except verdict.isOwnPage, a
   synchronous predicate that makes no request. Success resolves { ok: true, ... };
   failure resolves { ok: false, error } where error is one of
     transport  "timeout" | "offline" | "server" | "cache_down"
     domain     "invalid" (login/session; history when signed out) |
                "duplicate" (register) |
                "forbidden" (domain policies, cache, metrics) |
                "already_submitted" (survey submit)

   verdict port
     evaluate(url)            -> { ok, domain, verdict, policy, score, source, latencyMs }
                                 verdict: "phishing" | "legitima"   (the model class)
                                 policy: "advertencia" | "bloqueo"  (the domain policy, always present)
                                 source: "cache" | "modelo"
                                 The port never answers a final status: the extension applies
                                 the policy (Sereno.verdict.applyPolicy) to get "seguro",
                                 "advertencia" or "bloqueo".
                                 The backend also records the visit in the signed-in
                                 user's history; clients never write history.
     isOwnPage(url)           -> boolean, synchronous, never throws: true when url is a page
                                 served by the verdict backend itself (same scheme, host and
                                 port). Those pages are never evaluated; nothing else is
                                 exempt, not even other loopback or private addresses.

   auth port
     login(username, password)    -> { ok, user: { username, isAdmin, createdAt }, token }
     register(username, password) -> { ok, user: { username, isAdmin, createdAt }, token }   (signs the new user in)
     logout()                     -> { ok }
     session()                    -> { ok, session: { username, isAdmin, loginAt, token? } | null }
     The token is opaque; the backend verifies credentials, clients never do.

   data port (history is scoped to the signed-in user)
     listHistory()                     -> { ok, entries: [{ id, domain, verdict, policy, score, source, ts, latencyMs }] }
                                          (policy: the one in force when the visit was served)
     deleteHistory()                   -> { ok }   (clears the signed-in user's entries)
     getDomainPolicies()               -> { ok, domains: [{ domain, policy, updatedAt }] }
     putDomainPolicies(domains)        -> { ok }   (replaces the whole list)
     getCache()                        -> { ok, cache: { ttlPhishingDays, ttlLegitHours, invalidations: [{ domain, verdict, date }] } }
                                          (verdict: the model class, or null while the re-evaluation is
                                          pending; several entries may share a domain)
     setCacheTtl(phishingDays, legitHours) -> { ok, cache }
     invalidateCache(domain)           -> { ok, cache }
     getMetrics()                      -> { ok, metrics }   (dashboard shape: { analyzed, deltaPct, phishingPct, phishingCount,
                                          latencyMs, latencyTargetMs, cacheHitPct, sparklines, hourly, queries })
     getModelVersion()                 -> { ok, version }

   survey port
     status()                          -> { ok, submitted }
     submit(answers)                   -> { ok }   (answers: ten SUS values) */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};
  Sereno.providers.ports = {
    ERRORS: ["timeout", "offline", "server", "cache_down"],
    METHODS: {
      verdict: ["evaluate", "isOwnPage"],
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
        "getModelVersion"
      ],
      survey: ["status", "submit"]
    }
  };
})(globalThis.Sereno = globalThis.Sereno || {});

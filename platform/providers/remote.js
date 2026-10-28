/* Platform · remote adapter: implements verdict, auth, data and survey ports over
   HTTP+JSON. Classic script that registers Sereno.providers.remote.

   BACKEND CONTRACT (all paths under config.baseUrl, JSON bodies, cookies sent
   with credentials: "include"; 2xx bodies are exactly the port results without
   "ok", which this adapter adds):
     POST   /v1/verdict              { url }                            -> { domain, status, score, source, latencyMs }
                                     (also records the visit in the signed-in user's history)
     POST   /v1/auth/login           { username, password }             -> { user, token }  401 { error: "invalid" }
     POST   /v1/auth/register        { username, password }             -> { user, token }  409 { error: "duplicate" }, 400 { error: "invalid" }
     POST   /v1/auth/logout          {}                                 -> {}
     GET    /v1/auth/session                                            -> { session }      (null when signed out)
     GET    /v1/history                                                 -> { entries }
     DELETE /v1/history                                                 -> {}
     GET    /v1/domains                                                 -> { domains }
     PUT    /v1/domains              { domains }                        -> { domains }
     GET    /v1/cache                                                   -> { cache }
     PUT    /v1/cache/ttl            { ttlPhishingDays, ttlLegitHours } -> { cache }
     POST   /v1/cache/invalidations  { domain }                         -> { cache }
     GET    /v1/metrics                                                 -> { metrics }
     GET    /v1/model                                                   -> { version }
     GET    /v1/survey                                                  -> { submitted }
     POST   /v1/survey               { answers }                        -> {}  409 { error: "already_submitted" }
   Errors: a non-2xx body { error } with a known code is passed through
   ("invalid", "duplicate", "cache_down", "timeout", "offline", "server");
   "forbidden" is accepted only from domain-policy requests and
   "already_submitted" only from POST /v1/survey.
   HTTP 504 maps to "timeout"; any other failure maps to "server".
   create({ baseUrl, timeoutMs, fetch }) never throws to its callers: a network
   failure resolves "offline"; no answer within timeoutMs aborts the request
   and resolves "timeout".

   Requests come from the service worker and the extension pages, whose origin
   is chrome-extension://<id>, so they are cross-origin to the backend. Either
   list the backend origin in manifest.json host_permissions (recommended: no
   CORS needed) or make the backend answer CORS for that origin. Session
    cookies travel with credentials: "include". Chrome treats host-permitted
    extension requests as same-site (browser cookie settings still apply), so
    direct loopback HTTP development can use HttpOnly, SameSite=Lax cookies.
    Secure/SameSite=None remains the backend default outside its explicit
    loopback mode. Real Chrome behavior remains unverified. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};

  var KNOWN_ERRORS = ["invalid", "duplicate", "cache_down", "timeout", "offline", "server"];
  var DEFAULT_TIMEOUT_MS = 4000;

  function failure(error) {
    return { ok: false, error: error };
  }

  function errorOf(status, body, allowedErrors) {
    if (status === 504) {
      return "timeout";
    }
    var code = body && typeof body === "object" ? body.error : null;
    var allowed = KNOWN_ERRORS.concat(allowedErrors || []);
    return allowed.indexOf(code) >= 0 ? code : "server";
  }

  function create(options) {
    var settings = options || {};
    var baseUrl = String(settings.baseUrl || "").replace(/\/+$/, "");
    var timeoutMs = settings.timeoutMs > 0 ? settings.timeoutMs : DEFAULT_TIMEOUT_MS;
    var fetchImpl =
      settings.fetch ||
      function () {
        return globalThis.fetch.apply(globalThis, arguments);
      };

    async function request(method, path, payload, allowedErrors) {
      var controller = new AbortController();
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        var init = {
          method: method,
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          signal: controller.signal
        };
        if (payload !== undefined) {
          init.body = JSON.stringify(payload);
        }
        var response = await fetchImpl(baseUrl + path, init);
        var body = {};
        if (response.status !== 204) {
          try {
            body = await response.json();
          } catch (error) {
            return failure(timedOut ? "timeout" : "server");
          }
        }
        if (!response.ok) {
          return failure(errorOf(response.status, body, allowedErrors));
        }
        return Object.assign({ ok: true }, body);
      } catch (error) {
        if (timedOut || (error && error.name === "AbortError")) {
          return failure("timeout");
        }
        return failure("offline");
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      verdict: {
        evaluate: function (url) {
          return request("POST", "/v1/verdict", { url: url });
        }
      },
      auth: {
        remote: true,
        login: function (username, password) {
          return request("POST", "/v1/auth/login", { username: username, password: password });
        },
        register: function (username, password) {
          return request("POST", "/v1/auth/register", { username: username, password: password });
        },
        logout: function () {
          return request("POST", "/v1/auth/logout", {});
        },
        session: function () {
          return request("GET", "/v1/auth/session");
        }
      },
      data: {
        listHistory: function () {
          return request("GET", "/v1/history");
        },
        deleteHistory: function () {
          return request("DELETE", "/v1/history");
        },
        getDomainPolicies: function () {
          return request("GET", "/v1/domains", undefined, ["forbidden"]);
        },
        putDomainPolicies: function (domains) {
          return request("PUT", "/v1/domains", { domains: domains }, ["forbidden"]);
        },
        getCache: function () {
          return request("GET", "/v1/cache");
        },
        setCacheTtl: function (phishingDays, legitHours) {
          return request("PUT", "/v1/cache/ttl", { ttlPhishingDays: phishingDays, ttlLegitHours: legitHours });
        },
        invalidateCache: function (domain) {
          return request("POST", "/v1/cache/invalidations", { domain: domain });
        },
        getMetrics: function () {
          return request("GET", "/v1/metrics");
        },
        getModelVersion: function () {
          return request("GET", "/v1/model");
        }
      },
      survey: {
        status: function () {
          return request("GET", "/v1/survey");
        },
        submit: function (answers) {
          return request("POST", "/v1/survey", { answers: answers }, ["already_submitted"]);
        }
      }
    };
  }

  Sereno.providers.remote = { create: create };
})(globalThis.Sereno = globalThis.Sereno || {});

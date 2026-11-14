/* Platform · backend settings, read only by the composition root. baseUrl is
   the origin of the backend that serves verdicts, history, cache, metrics, the
   model version, authentication, domain policies and surveys; manifest
   host_permissions must permit its scheme and host. timeoutMs bounds every
   request. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};
  Sereno.providers.config = {
    baseUrl: "http://127.0.0.1:5000",
    timeoutMs: 4000
  };
})(globalThis.Sereno = globalThis.Sereno || {});

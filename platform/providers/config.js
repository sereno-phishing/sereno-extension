/* Platform · independent provider axes. provider selects verdict/data;
   authProvider selects authentication (defaults to provider when omitted).
   Surveys always use the remote adapter: there is no mock or fallback path.
   Local development uses remote auth and surveys. baseUrl is the backend origin;
   manifest host_permissions must permit its scheme and host. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};
  Sereno.providers.config = {
    provider: "mock",
    authProvider: "remote",
    baseUrl: "http://127.0.0.1:5000",
    timeoutMs: 4000,
    mockDelayMs: 700
  };
})(globalThis.Sereno = globalThis.Sereno || {});

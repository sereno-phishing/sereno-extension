/* Platform · independent provider axes. provider selects verdict/general data;
   authProvider selects authentication and policyProvider selects only domain
   policies (each defaults to provider when omitted). Surveys always use the
   remote adapter: there is no mock or fallback path.
   Every axis is remote: the sibling backend serves verdicts (FakeClassifier
   until the ML model exists), history, cache, metrics, model version, auth,
   policies and surveys. For an offline demo set all three axes to "mock"
   (surveys still need the backend). baseUrl is the backend origin; manifest
   host_permissions must permit its scheme and host. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};
  Sereno.providers.config = {
    provider: "remote",
    authProvider: "remote",
    policyProvider: "remote",
    baseUrl: "http://127.0.0.1:5000",
    timeoutMs: 4000,
    mockDelayMs: 700
  };
})(globalThis.Sereno = globalThis.Sereno || {});

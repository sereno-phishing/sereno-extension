/* Platform · provider switch: the file edited to connect a backend.
   Classic script that registers Sereno.providers.config.
     provider    "mock"   -> adapters on top of the seed data and the state store
                 "remote" -> adapters that call the REST contract in remote.js
     baseUrl     origin of the backend, used only by "remote" (no trailing path)
     timeoutMs   per-request limit before the remote adapter reports "timeout"
     mockDelayMs simulated "Evaluando…" latency of the mock verdict

   Hand-off checklist (the full guide is in README.md, "Conectar el backend"):
     1. Here: provider "remote", baseUrl "https://<backend origin>".
     2. manifest.json: put "https://<backend origin>/*" in host_permissions.
        The service worker and the extension pages are cross-origin to the
        backend; without that entry the backend itself must answer CORS for
        the chrome-extension://<id> origin, preflight and credentials included.
        tests/manifest.test.js fails when this file and host_permissions
        disagree.
     3. remote.js only if the real API differs from the contract it documents. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};
  Sereno.providers.config = {
    provider: "mock",
    baseUrl: "",
    timeoutMs: 4000,
    mockDelayMs: 700
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Platform · provider switch: the only file edited to connect a backend.
   Classic script that registers Sereno.providers.config.
     provider    "mock"   -> adapters on top of the seed data and the state store
                 "remote" -> adapters that call the REST contract in remote.js
     baseUrl     origin of the backend, used only by "remote" (no trailing path)
     timeoutMs   per-request limit before the remote adapter reports "timeout"
     mockDelayMs simulated "Evaluando…" latency of the mock verdict */

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

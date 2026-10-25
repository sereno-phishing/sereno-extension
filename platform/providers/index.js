/* Platform · composition root: the only place that knows which adapter backs
   the ports. Classic script that registers Sereno.providers.create and
   Sereno.services = { provider, verdict, auth, data }. Everything else
   (use cases, containers, pages) depends on Sereno.services alone.
   create({ config?, fetch?, store?, delayMs?, now? }): config defaults to
   Sereno.providers.config; fetch, store, delayMs and now are test seams. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};

  function create(options) {
    var settings = options || {};
    var config = settings.config || Sereno.providers.config;
    var adapter;
    if (config.provider === "mock") {
      adapter = Sereno.providers.mock.create({
        store: settings.store,
        delayMs: settings.delayMs === undefined ? config.mockDelayMs : settings.delayMs,
        now: settings.now
      });
    } else if (config.provider === "remote") {
      adapter = Sereno.providers.remote.create({
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        fetch: settings.fetch
      });
    } else {
      throw new Error("Unknown provider in platform/providers/config.js: " + config.provider);
    }
    return { provider: config.provider, verdict: adapter.verdict, auth: adapter.auth, data: adapter.data };
  }

  Sereno.providers.create = create;
  Sereno.services = create();
})(globalThis.Sereno = globalThis.Sereno || {});

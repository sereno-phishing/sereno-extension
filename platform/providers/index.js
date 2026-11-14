/* Platform · composition root: the only place that builds the adapter behind
   the ports. Classic script that registers Sereno.providers.create and
   Sereno.services = { verdict, auth, data, survey }. Everything else (use
   cases, containers, pages) depends on Sereno.services alone.
   create({ config?, fetch? }): config defaults to Sereno.providers.config;
   fetch is a test seam. */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};

  function create(options) {
    var settings = options || {};
    var config = settings.config || Sereno.providers.config;
    return Sereno.providers.remote.create({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      fetch: settings.fetch
    });
  }

  Sereno.providers.create = create;
  Sereno.services = create();
})(globalThis.Sereno = globalThis.Sereno || {});

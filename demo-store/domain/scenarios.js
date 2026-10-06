/* Demo store: the four simulated navigation scenarios and how each becomes the
   current site and a history visit. Classic script that registers
   Sereno.demoScenarios. Pure. */

(function (Sereno) {
  "use strict";

  /* Domain, verdict, score, source and latency mirror the mockups and the seed history. */
  var SCENARIOS = {
    seguro: { domain: "tienda-servicios.pe", status: "seguro", score: 0.04, source: "modelo", latencyMs: 142 },
    advertencia: { domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo", latencyMs: 186 },
    bloqueo: { domain: "pago-servicios-linea.net", status: "bloqueo", score: 0.97, source: "cache", latencyMs: 38 },
    pendiente: { domain: "reservas-hotel-lima.com", status: "pendiente", score: null, source: null, latencyMs: null }
  };

  /* "Volver" always returns to this scenario. */
  var SAFE = "seguro";

  function find(name) {
    return SCENARIOS[name] || null;
  }

  function siteOf(scenario, stamp) {
    return { domain: scenario.domain, status: scenario.status, score: scenario.score, source: scenario.source, ts: stamp };
  }

  function visitOf(scenario, stamp) {
    return {
      domain: scenario.domain,
      status: scenario.status,
      score: scenario.score,
      source: scenario.source,
      latencyMs: scenario.latencyMs,
      ts: stamp
    };
  }

  /* A pending evaluation has no verdict, so it is not recorded in history. */
  function isRecorded(scenario) {
    return scenario.status !== "pendiente";
  }

  Sereno.demoScenarios = {
    SCENARIOS: SCENARIOS,
    SAFE: SAFE,
    find: find,
    siteOf: siteOf,
    visitOf: visitOf,
    isRecorded: isRecorded
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Platform · mock adapter: implements the verdict, auth and data ports on top
   of the seed data, the demo-store scenarios and the shared state store.
   Classic script that registers Sereno.providers.mock.
   create({ store?, delayMs?, now? })
     store    state store port; defaults to Sereno.stateStore.open() on first use
     delayMs  simulated verdict latency, 0 by default (config.mockDelayMs in the app)
     now      () -> Date, injectable clock */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};

  /* Verdict for domains with no scenario: a plain safe model result. */
  var FALLBACK = { status: "seguro", score: 0.05, source: "modelo", latencyMs: 142 };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function domainOf(url) {
    var text = String(url || "").trim();
    var host;
    try {
      host = new URL(text).hostname;
    } catch (error) {
      host = text;
    }
    return host.toLowerCase().replace(/^www\./, "");
  }

  function wait(ms) {
    return ms > 0
      ? new Promise(function (resolve) {
          setTimeout(resolve, ms);
        })
      : Promise.resolve();
  }

  function create(options) {
    var settings = options || {};
    var delayMs = settings.delayMs || 0;
    var now =
      settings.now ||
      function () {
        return new Date();
      };
    var store = settings.store || null;

    function getStore() {
      if (!store) {
        store = Sereno.stateStore.open();
      }
      return store;
    }

    async function evaluate(url) {
      await wait(delayMs);
      var domain = domainOf(url);
      var scenarios = Sereno.demoScenarios.SCENARIOS;
      var found = FALLBACK;
      Object.keys(scenarios).forEach(function (name) {
        var candidate = scenarios[name];
        if (candidate.domain === domain && Sereno.verdict.VERDICTS.indexOf(candidate.status) >= 0) {
          found = candidate;
        }
      });
      return { ok: true, domain: domain, status: found.status, score: found.score, source: found.source, latencyMs: found.latencyMs };
    }

    async function login(username, password) {
      return Sereno.accountService.login(getStore(), username, password, now());
    }

    async function register(username, password) {
      return Sereno.accountService.register(getStore(), username, password, now());
    }

    async function logout() {
      await Sereno.accountService.logout(getStore());
      return { ok: true };
    }

    async function session() {
      var state = await getStore().get();
      return { ok: true, session: state.session ? clone(state.session) : null };
    }

    async function listHistory() {
      var state = await getStore().get();
      var username = state.session ? state.session.username : null;
      return { ok: true, entries: clone(Sereno.history.entriesOf(state.history, username)) };
    }

    async function deleteHistory() {
      var state = await getStore().get();
      if (state.session) {
        await Sereno.historyService.clear(getStore(), state.session.username);
      }
      return { ok: true };
    }

    async function getDomainPolicies() {
      var state = await getStore().get();
      return { ok: true, domains: state.domains };
    }

    async function putDomainPolicies(domains) {
      await Sereno.administrationService.saveDomains(getStore(), clone(domains));
      return { ok: true };
    }

    async function getCache() {
      var state = await getStore().get();
      return { ok: true, cache: state.cache };
    }

    async function setCacheTtl(phishingDays, legitHours) {
      await Sereno.administrationService.saveTtl(getStore(), phishingDays, legitHours);
      return getCache();
    }

    async function invalidateCache(domain) {
      await Sereno.administrationService.invalidateDomain(getStore(), domain, now());
      return getCache();
    }

    async function getMetrics() {
      return { ok: true, metrics: clone(Sereno.seed.metrics) };
    }

    async function getModelVersion() {
      var state = await getStore().get();
      return { ok: true, version: Sereno.protection.modelVersion(state) };
    }

    async function submitSurvey(answers) {
      await Sereno.surveyService.saveAnswers(getStore(), answers, true, now());
      return { ok: true };
    }

    return {
      verdict: { evaluate: evaluate },
      auth: { login: login, register: register, logout: logout, session: session },
      data: {
        listHistory: listHistory,
        deleteHistory: deleteHistory,
        getDomainPolicies: getDomainPolicies,
        putDomainPolicies: putDomainPolicies,
        getCache: getCache,
        setCacheTtl: setCacheTtl,
        invalidateCache: invalidateCache,
        getMetrics: getMetrics,
        getModelVersion: getModelVersion,
        submitSurvey: submitSurvey
      }
    };
  }

  Sereno.providers.mock = { create: create };
})(globalThis.Sereno = globalThis.Sereno || {});

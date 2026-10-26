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
    var tokenCounter = 0;

    function getStore() {
      if (!store) {
        store = Sereno.stateStore.open();
      }
      return store;
    }

    function newHistoryId() {
      return "h-" + now().getTime().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /* The backend records what it evaluates in the signed-in user's history;
       anonymous visits are not kept. A failed write never fails the verdict. */
    async function recordVisit(verdict) {
      try {
        await getStore().transact(function (state) {
          var username = state.session ? state.session.username : null;
          if (!username) {
            return { result: null };
          }
          var record = Sereno.history.createRecord(verdict, newHistoryId(), Sereno.time.stamp(now()));
          var byUser = Object.assign({}, state.history);
          byUser[username] = Sereno.history.append(Sereno.history.entriesOf(state.history, username), record);
          return { patch: { history: byUser }, result: null };
        });
      } catch (error) {
        /* the history is a side effect of the verdict */
      }
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
      var verdict = { ok: true, domain: domain, status: found.status, score: found.score, source: found.source, latencyMs: found.latencyMs };
      await recordVisit(verdict);
      return verdict;
    }

    /* The mock plays the backend: it is the only place that checks a
       password (against the seed users) and the only one that issues tokens. */
    function issueToken() {
      tokenCounter += 1;
      return "mock-" + now().getTime().toString(36) + "-" + tokenCounter.toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }

    async function login(username, password) {
      var valid = Sereno.account.validateCredentials(username, password);
      if (!valid.ok) {
        return valid;
      }
      return getStore().transact(function (state) {
        var user = Sereno.account.findUser(state.users, username);
        if (!user || user.password !== password) {
          return { result: { ok: false, error: "invalid" } };
        }
        var token = issueToken();
        return {
          patch: { session: Sereno.account.openSession(user, token, Sereno.time.stamp(now())) },
          result: { ok: true, user: Sereno.account.publicUser(user), token: token }
        };
      });
    }

    async function register(username, password) {
      var valid = Sereno.account.validateCredentials(username, password);
      if (!valid.ok) {
        return valid;
      }
      return getStore().transact(function (state) {
        if (Sereno.account.findUser(state.users, username)) {
          return { result: { ok: false, error: "duplicate" } };
        }
        var stamp = Sereno.time.stamp(now());
        var created = Sereno.account.newUser(username, stamp);
        var token = issueToken();
        return {
          patch: {
            users: state.users.concat([Object.assign({ password: password }, created)]),
            session: Sereno.account.openSession(created, token, stamp)
          },
          result: { ok: true, user: Sereno.account.publicUser(created), token: token }
        };
      });
    }

    async function logout() {
      await getStore().set({ session: null });
      return { ok: true };
    }

    async function session() {
      return getStore().transact(function (state) {
        return { result: { ok: true, session: state.session ? clone(state.session) : null } };
      });
    }

    async function listHistory() {
      var state = await getStore().get();
      var username = state.session ? state.session.username : null;
      return { ok: true, entries: clone(Sereno.history.entriesOf(state.history, username)) };
    }

    async function deleteHistory() {
      await getStore().transact(function (state) {
        if (!state.session) {
          return { result: null };
        }
        var byUser = Object.assign({}, state.history);
        byUser[state.session.username] = [];
        return { patch: { history: byUser }, result: null };
      });
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
      var stamp = Sereno.time.stamp(now());
      await getStore().update(function (state) {
        return { survey: Object.assign({}, state.survey, { answers: answers.slice(), completedAt: stamp }) };
      });
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

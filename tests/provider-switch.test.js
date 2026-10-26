"use strict";

/* Executable proof of the swap promise. The same scenarios run through the real
   use cases twice, each time in a fresh Sereno namespace built from the real
   scripts: once with provider "mock" and once with provider "remote". The only
   difference between the two runs is the config values (provider, baseUrl and
   the timeouts); no other script is touched. The remote run reaches a fake
   backend that serves the REST contract documented in
   platform/providers/remote.js through globalThis.fetch, exactly where the
   real adapter finds it. The scenarios must give identical normalized results.

   The fake backend reuses the mock adapter over its own private store as the
   server logic: it is a stand-in for the real server, not part of the client. */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CONFIG_FILE = "platform/providers/config.js";
const SCRIPTS = [
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/ports.js",
  "platform/providers/errors.js",
  "platform/providers/mock.js",
  "platform/providers/remote.js",
  "platform/providers/index.js",
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "account/domain/account.js",
  "history/domain/history.js",
  "survey/domain/sus.js",
  "administration/domain/domain-policy.js",
  "administration/domain/verdict-cache.js",
  "protection/domain/protection.js",
  "demo-store/domain/scenarios.js",
  "verdict/application/verdict-service.js",
  "account/application/account-service.js",
  "history/application/history-service.js",
  "survey/application/survey-service.js",
  "administration/application/administration-service.js",
  "protection/application/protection-service.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "protection/application/navigation-service.js"
];

const BASE_URL = "https://api.sereno.test";
const TIMEOUT_MS = 30;
const NOW = new Date(2026, 8, 21, 11, 30, 0);
const FAILURES = ["timeout", "offline", "server", "cache_down"];
const URLS = {
  safe: "https://tienda-servicios.pe/inicio",
  warn: "https://paypal-secure-login.com/login",
  block: "https://pago-servicios-linea.net/checkout",
  unknown: "https://www.example-shop.pe/"
};

/* ---------------- fresh namespace ---------------- */

function requireFresh(file) {
  const full = path.join(ROOT, file);
  delete require.cache[require.resolve(full)];
  require(full);
}

/* The one edit a backend hand-off needs: the values in config.js. */
function loadNamespace(configEdit) {
  delete globalThis.Sereno;
  requireFresh(CONFIG_FILE);
  Object.assign(globalThis.Sereno.providers.config, configEdit);
  SCRIPTS.forEach(requireFresh);
  return globalThis.Sereno;
}

/* ---------------- fake backend (REST contract of remote.js) ---------------- */

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeBackend(Sereno) {
  const store = Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
  const server = Sereno.providers.mock.create({ store, delayMs: 0, now: () => NOW });
  const backend = { calls: [], failWith: null };

  const routes = {
    "POST /v1/verdict": (body) => server.verdict.evaluate(body.url),
    "POST /v1/auth/login": async (body) => {
      const out = await server.auth.login(body.username, body.password);
      return out.ok ? out : reply(401, out);
    },
    "POST /v1/auth/register": async (body) => {
      const out = await server.auth.register(body.username, body.password);
      return out.ok ? out : reply(out.error === "invalid" ? 400 : 409, out);
    },
    "POST /v1/auth/logout": () => server.auth.logout(),
    "GET /v1/auth/session": () => server.auth.session(),
    "GET /v1/history": () => server.data.listHistory(),
    "DELETE /v1/history": () => server.data.deleteHistory(),
    "GET /v1/domains": () => server.data.getDomainPolicies(),
    "PUT /v1/domains": (body) => server.data.putDomainPolicies(body.domains),
    "GET /v1/cache": () => server.data.getCache(),
    "PUT /v1/cache/ttl": (body) => server.data.setCacheTtl(body.ttlPhishingDays, body.ttlLegitHours),
    "POST /v1/cache/invalidations": (body) => server.data.invalidateCache(body.domain),
    "GET /v1/metrics": () => server.data.getMetrics(),
    "GET /v1/model": () => server.data.getModelVersion(),
    "POST /v1/survey": (body) => server.data.submitSurvey(body.answers)
  };

  function injectedFailure(init) {
    const mode = backend.failWith;
    if (mode === "offline") {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    if (mode === "timeout") {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    return Promise.resolve(mode === "cache_down" ? reply(503, { error: "cache_down" }) : reply(500, { error: "boom" }));
  }

  backend.fetch = async function fetchFake(url, init) {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    backend.calls.push({ method, path: url.slice(BASE_URL.length), body, credentials: init && init.credentials });
    if (backend.failWith) {
      return injectedFailure(init);
    }
    const route = routes[method + " " + url.slice(BASE_URL.length)];
    if (!route) {
      return reply(404, { error: "server" });
    }
    const out = await route(body);
    return out && typeof out.status === "number" && typeof out.json === "function" ? out : reply(200, out);
  };
  return backend;
}

/* ---------------- environments ---------------- */

function failingServices(mode) {
  const fail = async () => ({ ok: false, error: mode });
  return {
    provider: "mock",
    verdict: { evaluate: fail },
    auth: { login: fail, register: fail, logout: fail, session: fail },
    data: new Proxy({}, { get: () => fail })
  };
}

function fakeBrowser() {
  const records = new Map();
  return {
    badges: [],
    messages: [],
    async setBadge(tabId, text, color) {
      this.badges.push({ tabId, text, color });
    },
    async notifyTab(tabId, message) {
      this.messages.push({ tabId, message });
    },
    async getActiveTabId() {
      return 1;
    },
    async loadTabRecord(tabId) {
      return records.has(tabId) ? JSON.parse(JSON.stringify(records.get(tabId))) : null;
    },
    async saveTabRecord(tabId, record) {
      records.set(tabId, JSON.parse(JSON.stringify(record)));
    },
    async removeTabRecord(tabId) {
      records.delete(tabId);
    },
    async openPage() {}
  };
}

/* Builds one environment, runs the scenario in it and tears it down.
   The scenario only sees what a page or the worker sees: Sereno.services,
   a client state store and the browser port. */
async function inEnvironment(provider, scenario) {
  const realFetch = globalThis.fetch;
  const edit = provider === "mock"
    ? { provider: "mock", baseUrl: "", timeoutMs: TIMEOUT_MS, mockDelayMs: 0 }
    : { provider: "remote", baseUrl: BASE_URL, timeoutMs: TIMEOUT_MS, mockDelayMs: 0 };
  const Sereno = loadNamespace(edit);
  const backend = provider === "remote" ? fakeBackend(Sereno) : null;
  if (backend) {
    globalThis.fetch = backend.fetch;
  }
  const env = {
    provider,
    Sereno,
    backend,
    config: Object.assign({}, Sereno.providers.config),
    services: Sereno.services,
    now: NOW,
    newStore: () =>
      Sereno.stateStore.create({
        storage: Sereno.storage.memoryStorage(),
        key: Sereno.stateStore.STORAGE_KEY,
        defaults: Sereno.seed.defaultState
      }),
    newBrowser: fakeBrowser,
    /* Runs work while the provider fails with the given transport error. */
    async failing(mode, work) {
      if (!backend) {
        return work(failingServices(mode));
      }
      backend.failWith = mode;
      try {
        return await work(Sereno.services);
      } finally {
        backend.failWith = null;
      }
    }
  };
  try {
    return { result: await scenario(env), env };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ---------------- normalization ---------------- */

function failureOf(answer) {
  return { ok: answer.ok, error: answer.error, message: answer.message };
}

function sessionShape(session) {
  return session ? { username: session.username, role: session.role, hasToken: typeof session.token === "string" && session.token.length > 0 } : null;
}

function entryShape(entry) {
  return { domain: entry.domain, status: entry.status, score: entry.score, source: entry.source, latencyMs: entry.latencyMs };
}

function cacheShape(cache) {
  return {
    ttlPhishingDays: cache.ttlPhishingDays,
    ttlLegitHours: cache.ttlLegitHours,
    invalidations: cache.invalidations.map((item) => ({ domain: item.domain, status: item.status }))
  };
}

async function signIn(env, store, username, password) {
  const answer = await env.Sereno.accountService.login(env.services, store, username, password, env.now);
  assert.equal(answer.ok, true, "sign in " + username);
  return answer;
}

/* ---------------- scenarios ---------------- */

const SCENARIOS = {
  "login, session, logout and register": async (env) => {
    const { accountService } = env.Sereno;
    const store = env.newStore();
    const out = {};
    out.badLogin = failureOf(await accountService.login(env.services, store, "andres.torres", "mala", env.now));
    const good = await accountService.login(env.services, store, "admin.sereno", "sereno123", env.now);
    out.goodLogin = { ok: good.ok, username: good.user.username, role: good.user.role, hasToken: typeof good.token === "string" && good.token.length > 0, leaksPassword: "password" in good.user };
    const current = await accountService.currentSession(env.services, store);
    out.session = { ok: current.ok, verified: current.verified, session: sessionShape(current.session) };
    out.logout = await accountService.logout(env.services, store);
    const after = await accountService.currentSession(env.services, store);
    out.afterLogout = { verified: after.verified, session: after.session };
    out.duplicate = failureOf(await accountService.register(env.services, store, "andres.torres", "x", env.now));
    const created = await accountService.register(env.services, store, "cuenta.nueva", "x", env.now);
    out.register = { ok: created.ok, username: created.user.username, role: created.user.role, hasToken: created.token.length > 0 };
    return out;
  },

  "evaluate a safe site": async (env) => env.Sereno.verdictService.evaluate(env.services, URLS.safe),
  "evaluate a warning site": async (env) => env.Sereno.verdictService.evaluate(env.services, URLS.warn),
  "evaluate a blocked site": async (env) => env.Sereno.verdictService.evaluate(env.services, URLS.block),
  "evaluate a site with no scenario": async (env) => env.Sereno.verdictService.evaluate(env.services, URLS.unknown),

  "degraded on backend failure (verdict and data)": async (env) => {
    const out = {};
    for (const mode of FAILURES) {
      out[mode] = await env.failing(mode, async (services) => {
        const outcome = await env.Sereno.verdictService.evaluate(services, URLS.safe);
        return {
          outcome,
          blocks: env.Sereno.verdictOutcome.blocksNavigation(outcome),
          history: failureOf(await env.Sereno.historyService.list(services)),
          model: failureOf(await env.Sereno.protectionService.loadModelVersion(services)),
          metrics: failureOf(await env.Sereno.administrationService.loadMetrics(services))
        };
      });
    }
    return out;
  },

  "history list and delete": async (env) => {
    const { historyService } = env.Sereno;
    const store = env.newStore();
    await signIn(env, store, "andres.torres", "sereno123");
    const before = await historyService.list(env.services);
    await env.Sereno.verdictService.evaluate(env.services, URLS.block);
    const visited = await historyService.list(env.services);
    const cleared = await historyService.clear(env.services);
    const empty = await historyService.list(env.services);
    return {
      before: before.entries.map(entryShape),
      visited: visited.entries.map(entryShape),
      cleared,
      empty: empty.entries
    };
  },

  "admin policy": async (env) => {
    const { administrationService } = env.Sereno;
    const store = env.newStore();
    await signIn(env, store, "admin.sereno", "sereno123");
    const before = await administrationService.loadDomains(env.services);
    const added = await administrationService.addDomain(env.services, { domain: "banco-falso.pe", policy: "bloqueo", updatedAt: "21/09/2026" });
    const edited = before.domains.map((row) => ({ domain: row.domain, policy: "bloqueo", updatedAt: row.updatedAt }));
    const saved = await administrationService.saveDomains(env.services, edited);
    const after = await administrationService.loadDomains(env.services);
    return { before, added, saved, after };
  },

  "admin cache": async (env) => {
    const { administrationService } = env.Sereno;
    const store = env.newStore();
    await signIn(env, store, "admin.sereno", "sereno123");
    const before = await administrationService.loadCache(env.services);
    const ttl = await administrationService.saveTtl(env.services, "10", "12");
    const invalidated = await administrationService.invalidateDomain(env.services, "banco-falso.pe");
    return {
      before: cacheShape(before.cache),
      ttl: cacheShape(ttl.cache),
      invalidated: cacheShape(invalidated.cache)
    };
  },

  "admin metrics and model version": async (env) => {
    const metrics = await env.Sereno.administrationService.loadMetrics(env.services);
    const model = await env.Sereno.protectionService.loadModelVersion(env.services);
    return { metrics, model };
  },

  "survey submit": async (env) => {
    const { surveyService } = env.Sereno;
    const store = env.newStore();
    const answers = [4, 2, 5, 1, 4, 2, 5, 1, 4, 2];
    const failed = await env.failing("server", (services) => surveyService.submit(services, store, answers, env.now));
    const pendingState = (await store.get()).survey;
    const done = await surveyService.submit(env.services, store, answers, env.now);
    const state = (await store.get()).survey;
    return {
      failed: failureOf(failed),
      completedAfterFailure: pendingState.completedAt,
      done,
      answers: state.answers,
      completed: typeof state.completedAt === "string" && state.completedAt.length > 0
    };
  }
};

/* What the service worker does on a real navigation: verdict, badge, popup
   state and the message for the content script. */
async function navigate(env, url, services) {
  const browser = env.newBrowser();
  const store = env.newStore();
  const outcome = await env.Sereno.navigationService.handleNavigation(
    { services, store, browser, now: () => env.now },
    { tabId: 1, url }
  );
  const state = await store.get();
  return {
    outcome,
    badge: browser.badges[browser.badges.length - 1],
    messages: browser.messages.map((entry) => ({ tabId: entry.tabId, type: entry.message.type, kind: entry.message.outcome.kind })),
    lastMessage: browser.messages[browser.messages.length - 1].message.outcome,
    currentSite: state.currentSite && { domain: state.currentSite.domain, status: state.currentSite.status },
    protectionLevel: state.protectionLevel
  };
}

const NAVIGATION = {
  "service worker navigation to a safe site": (env) => navigate(env, URLS.safe, env.services),
  "service worker navigation to a warning site": (env) => navigate(env, URLS.warn, env.services),
  "service worker navigation to a blocked site": (env) => navigate(env, URLS.block, env.services),
  "service worker navigation degrades when the backend fails": async (env) => {
    const out = {};
    for (const mode of FAILURES) {
      out[mode] = await env.failing(mode, (services) => navigate(env, URLS.safe, services));
    }
    return out;
  }
};

Object.assign(SCENARIOS, NAVIGATION);

/* Absolute expectations: the two providers must not merely agree, both must
   be right. */
const EXPECTED = {
  "login, session, logout and register": (r) => {
    assert.equal(r.badLogin.error, "invalid");
    assert.equal(r.goodLogin.role, "administrador");
    assert.equal(r.goodLogin.hasToken, true);
    assert.equal(r.goodLogin.leaksPassword, false);
    assert.deepEqual(r.session.session, { username: "admin.sereno", role: "administrador", hasToken: true });
    assert.equal(r.session.verified, true);
    assert.equal(r.afterLogout.session, null);
    assert.equal(r.duplicate.error, "duplicate");
    assert.equal(r.register.role, "usuario");
  },
  "evaluate a safe site": (r) => assert.equal(r.verdict.status, "seguro"),
  "evaluate a warning site": (r) => assert.equal(r.verdict.status, "advertencia"),
  "evaluate a blocked site": (r) => {
    assert.equal(r.verdict.status, "bloqueo");
    assert.equal(r.verdict.source, "cache");
  },
  "evaluate a site with no scenario": (r) => assert.equal(r.kind, "verdict"),
  "degraded on backend failure (verdict and data)": (r) => {
    FAILURES.forEach((mode) => {
      assert.deepEqual(r[mode].outcome, { kind: "degraded", reason: mode });
      assert.equal(r[mode].blocks, false, "fail-open: " + mode);
      [r[mode].history, r[mode].model, r[mode].metrics].forEach((answer) => {
        assert.equal(answer.ok, false);
        assert.equal(answer.error, mode);
        assert.equal(typeof answer.message, "string");
      });
    });
  },
  "history list and delete": (r) => {
    assert.equal(r.visited.length, r.before.length + 1);
    assert.equal(r.visited[0].domain, "pago-servicios-linea.net");
    assert.equal(r.visited[0].status, "bloqueo");
    assert.deepEqual(r.cleared, { ok: true });
    assert.deepEqual(r.empty, []);
  },
  "admin policy": (r) => {
    assert.equal(r.added.ok, true);
    assert.equal(r.added.domains[0].domain, "banco-falso.pe");
    assert.equal(r.saved.ok, true);
    assert.ok(r.after.domains.length > 0 && r.after.domains.every((row) => row.policy === "bloqueo"));
  },
  "admin cache": (r) => {
    assert.equal(r.ttl.ttlPhishingDays, 10);
    assert.equal(r.ttl.ttlLegitHours, 12);
    assert.ok(r.invalidated.invalidations.some((item) => item.domain === "banco-falso.pe"));
  },
  "admin metrics and model version": (r) => {
    assert.equal(r.metrics.ok, true);
    assert.equal(r.model.ok, true);
    assert.equal(typeof r.model.version, "string");
  },
  "survey submit": (r) => {
    assert.equal(r.failed.ok, false);
    assert.equal(r.failed.error, "server");
    assert.ok(!r.completedAfterFailure, "a failed submit records nothing");
    assert.deepEqual(r.done, { ok: true });
    assert.equal(r.completed, true);
  },
  "service worker navigation to a safe site": (r) => {
    assert.equal(r.badge.tabId, 1);
    assert.equal(r.badge.text, "✓");
    assert.equal(r.currentSite.status, "seguro");
    assert.equal(r.protectionLevel, "active");
    assert.equal(r.lastMessage.kind, "verdict");
  },
  "service worker navigation to a warning site": (r) => {
    assert.equal(r.currentSite.status, "advertencia");
    assert.equal(r.lastMessage.verdict.status, "advertencia");
  },
  "service worker navigation to a blocked site": (r) => {
    assert.equal(r.badge.text, "✕");
    assert.equal(r.currentSite.status, "bloqueo");
    assert.equal(r.lastMessage.verdict.status, "bloqueo");
  },
  "service worker navigation degrades when the backend fails": (r) => {
    FAILURES.forEach((mode) => {
      assert.deepEqual(r[mode].lastMessage, { kind: "degraded", reason: mode });
      assert.equal(r[mode].badge.text, "?");
      assert.equal(r[mode].protectionLevel, "degraded");
      assert.ok(r[mode].messages.every((entry) => entry.tabId === 1 && entry.type === "sereno:outcome"));
    });
  }
};

Object.keys(SCENARIOS).forEach((name) => {
  test("swap: " + name + " gives the same result with mock and remote", async () => {
    const mock = await inEnvironment("mock", SCENARIOS[name]);
    const remote = await inEnvironment("remote", SCENARIOS[name]);
    assert.deepEqual(remote.result, mock.result);
    assert.ok(EXPECTED[name], "every scenario states what is right");
    EXPECTED[name](mock.result);
  });
});

test("swap: the config values are the only difference between the two runs", async () => {
  const noop = async () => null;
  const mock = await inEnvironment("mock", noop);
  const remote = await inEnvironment("remote", noop);
  assert.equal(mock.env.services.provider, "mock");
  assert.equal(remote.env.services.provider, "remote");
  const differing = Object.keys(remote.env.config).filter((key) => remote.env.config[key] !== mock.env.config[key]);
  assert.deepEqual(differing.sort(), ["baseUrl", "provider"]);
  assert.deepEqual(Object.keys(remote.env.config).sort(), ["baseUrl", "mockDelayMs", "provider", "timeoutMs"]);
});

test("swap: the remote run really goes through the REST contract and the mock run never does", async () => {
  const mock = await inEnvironment("mock", (env) => env.Sereno.verdictService.evaluate(env.services, URLS.block));
  assert.equal(mock.env.backend, null);

  const remote = await inEnvironment("remote", async (env) => {
    await env.Sereno.verdictService.evaluate(env.services, URLS.block);
    return env.backend.calls;
  });
  assert.deepEqual(remote.result.map((call) => call.method + " " + call.path), ["POST /v1/verdict"]);
  assert.deepEqual(remote.result[0].body, { url: URLS.block });
  assert.equal(remote.result[0].credentials, "include");
});

test("swap: timeouts and offline failures come from the transport, not from a shortcut", async () => {
  const { result } = await inEnvironment("remote", async (env) => {
    const started = Date.now();
    const timeout = await env.failing("timeout", (services) => env.Sereno.verdictService.evaluate(services, URLS.safe));
    return { timeout, elapsedMs: Date.now() - started, calls: env.backend.calls.length };
  });
  assert.deepEqual(result.timeout, { kind: "degraded", reason: "timeout" });
  assert.ok(result.elapsedMs < 1000, "the adapter deadline (" + TIMEOUT_MS + " ms) fired, not the 6 s use case deadline");
  assert.equal(result.calls, 1);
});

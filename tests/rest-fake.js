/* Test-only stand-in for the Sereno backend. createRestFake(options) returns a
   fetch function that answers the REST contract documented in README.md
   ("Contrato REST") and in platform/providers/remote.js, so the remote adapter
   and the use cases run in Node with no server. It is never loaded by the
   manifest, an HTML page or the service worker.

   It keeps one client's state in memory: the accounts, a single cookie-like
   session, the history per user, the domain policies, the cache settings, the
   metrics, the model version and who already answered the survey.

   options
     baseUrl   origin the adapter under test was created with (required)
     now       () -> Date, the backend clock (defaults to the real one)
     users, history, domains, cache, classifications, metrics, modelVersion
               initial data; each defaults to tests/fixtures.js
   The returned function carries
     calls     [{ method, path, body, credentials, signal }] in arrival order
     state     the live data, for assertions on what the backend stored */

"use strict";

const fixtures = require("./fixtures");

const DEFAULT_POLICY = "advertencia";
const POLICIES = ["advertencia", "bloqueo"];
const UNKNOWN_DOMAIN = { verdict: "legitima", score: 0.05, source: "modelo", latencyMs: 142 };

function pad2(number) {
  return number < 10 ? "0" + number : String(number);
}

/* Local "YYYY-MM-DDTHH:MM", the stamp format of sessions, users and history. */
function stamp(date) {
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + "T" + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

function dayText(date) {
  return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear();
}

function domainOf(url) {
  let host;
  try {
    host = new URL(String(url).trim()).hostname;
  } catch (error) {
    return null;
  }
  return host.toLowerCase().replace(/^www\./, "");
}

function publicUser(user) {
  return { username: user.username, isAdmin: user.isAdmin === true, createdAt: user.createdAt };
}

function validCredentials(body) {
  return !!body && typeof body.username === "string" && body.username.trim().length > 0 && typeof body.password === "string" && body.password.length > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function failure(status, error) {
  return reply(status, { error });
}

function createRestFake(options) {
  const settings = options || {};
  const baseUrl = String(settings.baseUrl || "").replace(/\/+$/, "");
  const now = settings.now || (() => new Date());
  const state = {
    users: settings.users || fixtures.users(),
    history: settings.history || fixtures.history(),
    domains: settings.domains || fixtures.domains(),
    cache: settings.cache || fixtures.cache(),
    classifications: settings.classifications || fixtures.classifications(),
    metrics: settings.metrics || fixtures.metrics(),
    modelVersion: settings.modelVersion || fixtures.MODEL_VERSION,
    session: null,
    surveyed: []
  };
  let tokens = 0;
  let records = 0;

  function findUser(username) {
    return state.users.find((user) => user.username === username) || null;
  }

  function signIn(user) {
    tokens += 1;
    const token = "token-" + tokens;
    state.session = { username: user.username, isAdmin: user.isAdmin === true, loginAt: stamp(now()), token };
    return { user: publicUser(user), token };
  }

  /* 401 without a session, 403 for a user who is not an administrator. */
  function adminOnly(handler) {
    return (body) => {
      if (!state.session) {
        return failure(401, "invalid");
      }
      if (!state.session.isAdmin) {
        return failure(403, "forbidden");
      }
      return handler(body);
    };
  }

  function signedIn(handler) {
    return (body) => (state.session ? handler(body) : failure(401, "invalid"));
  }

  function policyOf(domain) {
    const row = state.domains.find((item) => item.domain === domain);
    return row ? row.policy : DEFAULT_POLICY;
  }

  const routes = {
    "POST /v1/verdict": (body) => {
      const domain = body ? domainOf(body.url) : null;
      if (!domain) {
        return failure(400, "invalid");
      }
      const found = Object.prototype.hasOwnProperty.call(state.classifications, domain) ? state.classifications[domain] : UNKNOWN_DOMAIN;
      const verdict = { domain, verdict: found.verdict, policy: policyOf(domain), score: found.score, source: found.source, latencyMs: found.latencyMs };
      if (state.session) {
        records += 1;
        const username = state.session.username;
        state.history[username] = [Object.assign({ id: "h-new-" + records, ts: stamp(now()) }, verdict)].concat(state.history[username] || []);
      }
      return reply(200, verdict);
    },
    "POST /v1/auth/login": (body) => {
      const user = validCredentials(body) ? findUser(body.username) : null;
      return user && user.password === body.password ? reply(200, signIn(user)) : failure(401, "invalid");
    },
    "POST /v1/auth/register": (body) => {
      if (!validCredentials(body)) {
        return failure(400, "invalid");
      }
      if (findUser(body.username)) {
        return failure(409, "duplicate");
      }
      const user = { username: body.username, password: body.password, isAdmin: false, createdAt: stamp(now()) };
      state.users.push(user);
      return reply(201, signIn(user));
    },
    "POST /v1/auth/logout": () => {
      state.session = null;
      return reply(200, {});
    },
    "GET /v1/auth/session": () => reply(200, { session: state.session ? Object.assign({}, state.session) : null }),
    "GET /v1/history": signedIn(() => reply(200, { entries: (state.history[state.session.username] || []).slice() })),
    "DELETE /v1/history": signedIn(() => {
      state.history[state.session.username] = [];
      return reply(200, {});
    }),
    "GET /v1/domains": adminOnly(() => reply(200, { domains: state.domains.slice() })),
    "PUT /v1/domains": adminOnly((body) => {
      const rows = body && Array.isArray(body.domains) ? body.domains : null;
      if (!rows || !rows.every((row) => row && typeof row.domain === "string" && POLICIES.includes(row.policy))) {
        return failure(400, "invalid");
      }
      state.domains = rows.map((row) => ({ domain: row.domain, policy: row.policy, updatedAt: row.updatedAt }));
      return reply(200, { domains: state.domains.slice() });
    }),
    "GET /v1/cache": adminOnly(() => reply(200, { cache: state.cache })),
    "PUT /v1/cache/ttl": adminOnly((body) => {
      if (!body || !positiveInteger(body.ttlPhishingDays) || !positiveInteger(body.ttlLegitHours)) {
        return failure(400, "invalid");
      }
      state.cache = Object.assign({}, state.cache, { ttlPhishingDays: body.ttlPhishingDays, ttlLegitHours: body.ttlLegitHours });
      return reply(200, { cache: state.cache });
    }),
    "POST /v1/cache/invalidations": adminOnly((body) => {
      if (!body || typeof body.domain !== "string" || !body.domain) {
        return failure(400, "invalid");
      }
      const entry = { domain: body.domain, verdict: null, date: dayText(now()) };
      state.cache = Object.assign({}, state.cache, { invalidations: [entry].concat(state.cache.invalidations || []) });
      return reply(200, { cache: state.cache });
    }),
    "GET /v1/metrics": adminOnly(() => reply(200, { metrics: state.metrics })),
    "GET /v1/model": () => reply(200, { version: state.modelVersion }),
    "GET /v1/survey": signedIn(() => reply(200, { submitted: state.surveyed.includes(state.session.username) })),
    "POST /v1/survey": signedIn((body) => {
      const answers = body && body.answers;
      if (!Array.isArray(answers) || answers.length !== 10 || !answers.every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) {
        return failure(400, "invalid");
      }
      if (state.surveyed.includes(state.session.username)) {
        return failure(409, "already_submitted");
      }
      state.surveyed.push(state.session.username);
      return reply(200, {});
    })
  };

  async function fetchFake(url, init) {
    const method = (init && init.method) || "GET";
    const path = String(url).slice(baseUrl.length);
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    fetchFake.calls.push({ method, path, body, credentials: init && init.credentials, signal: init && init.signal });
    const route = String(url).indexOf(baseUrl) === 0 ? routes[method + " " + path] : null;
    /* The answer is serialized like a real response body, so callers never share state objects with the backend. */
    const answer = route ? route(body) : failure(404, "server");
    const text = JSON.stringify(await answer.json());
    return { ok: answer.ok, status: answer.status, json: async () => JSON.parse(text) };
  }
  fetchFake.calls = [];
  fetchFake.state = state;
  return fetchFake;
}

module.exports = { createRestFake };

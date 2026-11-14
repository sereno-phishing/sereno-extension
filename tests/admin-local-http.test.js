"use strict";

/* Real loopback policy contract against the sibling backend on its own
   PostgreSQL database and Redis index (tests/local-backend.js). Node supplies
   the cookie jar; the production remote adapter remains unchanged. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { unavailable, startBackend } = require("./local-backend");

const Sereno = load("platform/providers/remote.js");

test("remote domain policies enforce live roles, persist CRUD and never fall back", {
  skip: unavailable(),
  timeout: 90000
}, async (t) => {
  const backend = await startBackend(t, { name: "admin", redisIndex: 12 });
  /* What an operator does by hand: the product API has no promotion route. */
  const setRole = (username, role) => assert.equal(backend.sql("UPDATE usuario SET rol = %s WHERE nombre = %s", [role, username]).count, 1);
  /* The stored policies, oldest first: [domain, policy, day]. */
  const storedPolicies = () => backend.sql("SELECT dominio, politica, fecha_actualizacion FROM politica_dominio ORDER BY id_politica").rows;

  let cookie = "";
  async function cookieFetch(url, init) {
    const response = await fetch(url, { ...init, headers: { ...init.headers, Cookie: cookie } });
    const header = response.headers.get("set-cookie");
    if (header) {
      cookie = header.split(";")[0];
    }
    return response;
  }
  const remote = Sereno.providers.remote.create({ baseUrl: backend.baseUrl, timeoutMs: 2000, fetch: cookieFetch });
  const registered = await remote.auth.register("policy-user", "throwaway-password");
  assert.equal(registered.ok, true);
  assert.equal(registered.user.isAdmin, false);
  assert.equal("role" in registered.user, false);

  assert.deepEqual(storedPolicies(), []);
  assert.deepEqual(await remote.data.getDomainPolicies(), { ok: false, error: "forbidden" });
  assert.deepEqual(await remote.data.putDomainPolicies([{ domain: "user.example", policy: "bloqueo", updatedAt: "2026-10-27" }]), { ok: false, error: "forbidden" });
  assert.deepEqual(storedPolicies(), [], "user rejections do not mutate policy storage");

  setRole("policy-user", "admin");
  assert.equal((await remote.auth.session()).session.isAdmin, true);
  const rows = [
    { domain: "  Shop.Example.COM  ", policy: "bloqueo", updatedAt: "2026-10-27" },
    { domain: "login.example.com", policy: "advertencia", updatedAt: "2026-10-28" }
  ];
  const normalized = [
    { domain: "shop.example.com", policy: "bloqueo", updatedAt: "2026-10-27" },
    { domain: "login.example.com", policy: "advertencia", updatedAt: "2026-10-28" }
  ];
  assert.deepEqual(await remote.data.putDomainPolicies(rows), { ok: true, domains: normalized });
  assert.deepEqual(await remote.data.getDomainPolicies(), { ok: true, domains: normalized });
  const stored = normalized.map((row) => [row.domain, row.policy, row.updatedAt]);
  assert.deepEqual(storedPolicies(), stored, "the database holds the normalized rows");

  const invalid = [{ domain: "bad.example", policy: "admin", updatedAt: "2026-10-29" }];
  assert.deepEqual(await remote.data.putDomainPolicies(invalid), { ok: false, error: "invalid" });
  assert.deepEqual(storedPolicies(), stored, "invalid writes do not mutate policy storage");

  setRole("policy-user", "user");
  assert.equal((await remote.auth.session()).session.isAdmin, false);
  assert.deepEqual(await remote.data.putDomainPolicies([]), { ok: false, error: "forbidden" });
  assert.deepEqual(storedPolicies(), stored, "demoted writes do not mutate policy storage");

  await backend.stop();
  assert.deepEqual(await remote.data.getDomainPolicies(), { ok: false, error: "offline" });
  assert.deepEqual(storedPolicies(), stored, "a transport failure has no fallback and no mutation");
});

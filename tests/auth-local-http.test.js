"use strict";

/* Real loopback HTTP contract, not Chrome: Node has no browser cookie jar.
   Only the cookie transport is supplied here; the remote adapter is unchanged.
   The sibling backend runs on its own PostgreSQL database and Redis index
   (tests/local-backend.js). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { unavailable, startBackend } = require("./local-backend");

const Sereno = load(
  "time/domain/time.js", "account/domain/account.js", "account/application/account-service.js",
  "platform/storage.js", "platform/state-store.js", "platform/providers/remote.js"
);

test("extension remote auth and survey complete their JSON lifecycle over real loopback HTTP", {
  skip: unavailable(),
  timeout: 90000
}, async (t) => {
  const backend = await startBackend(t, { name: "auth", redisIndex: 13 });
  const baseUrl = backend.baseUrl;
  let cookie = "";
  const calls = [];
  async function cookieFetch(url, init) {
    assert.equal(new URL(url).origin, baseUrl);
    assert.equal(init.credentials, "include");
    calls.push(new URL(url).pathname);
    const response = await fetch(url, { ...init, headers: { ...init.headers, Cookie: cookie } });
    const header = response.headers.get("set-cookie");
    if (header) {
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Lax/);
      assert.doesNotMatch(header, /Secure/);
      cookie = header.split(";")[0];
    }
    return response;
  }
  const services = Sereno.providers.remote.create({ baseUrl, fetch: cookieFetch });
  const store = Sereno.stateStore.create({ storage: Sereno.storage.memoryStorage(), key: "http-auth", defaults: { users: [], session: null } });
  const account = Sereno.accountService;
  assert.equal((await account.currentSession(services, store)).session, null);
  const registered = await account.register(services, store, "throwaway", "test-only-password", new Date());
  assert.equal(registered.ok, true);
  const firstToken = registered.token;
  const answers = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
  assert.deepEqual(await services.survey.status(), { ok: true, submitted: false });
  assert.deepEqual(await services.survey.submit(answers), { ok: true });
  assert.deepEqual(await services.survey.status(), { ok: true, submitted: true });
  assert.deepEqual(await services.survey.submit(answers), { ok: false, error: "already_submitted" });
  /* Stored answers carry no account: the table has no user column, and the
     participation is a separate row that only names the account. */
  const responses = backend.sql("SELECT respuestas FROM encuesta_respuesta").rows;
  assert.deepEqual(responses, [[answers]]);
  const columns = backend.sql("SELECT column_name FROM information_schema.columns WHERE table_name = 'encuesta_respuesta' ORDER BY 1").rows;
  assert.deepEqual(columns, [["fecha_envio"], ["id_respuesta"], ["respuestas"]]);
  const participants = backend.sql("SELECT u.nombre FROM encuesta_participante p JOIN usuario u USING (id_usuario)").rows;
  assert.deepEqual(participants, [["throwaway"]]);
  assert.equal(backend.sql("SELECT count(*) FROM sesion s JOIN usuario u USING (id_usuario) WHERE u.nombre = %s", ["throwaway"]).rows[0][0], 1, "one server-side session");
  const hash = backend.sql("SELECT hash_contrasena FROM usuario WHERE nombre = %s", ["throwaway"]).rows[0][0];
  assert.ok(hash.length > 20 && !hash.includes("test-only-password"), "the password is stored hashed");
  await store.set({ session: null });
  assert.equal((await account.currentSession(services, store)).session.token, firstToken);
  assert.equal((await account.register(services, store, "throwaway", "test-only-password", new Date())).error, "duplicate");
  assert.deepEqual(await account.logout(services, store), { ok: true, synced: true });
  assert.equal((await account.currentSession(services, store)).session, null);
  assert.equal((await account.login(services, store, "throwaway", "wrong", new Date())).error, "invalid");
  assert.equal((await account.login(services, store, "throwaway", "test-only-password", new Date())).ok, true);
  assert.equal((await account.currentSession(services, store)).session.username, "throwaway");
  assert.deepEqual(await account.logout(services, store), { ok: true, synced: true });
  assert.deepEqual(await services.survey.status(), { ok: false, error: "invalid" });
  assert.deepEqual(await services.survey.submit(answers), { ok: false, error: "invalid" });
  const second = await account.register(services, store, "second-account", "test-only-password", new Date());
  assert.equal(second.ok, true);
  assert.deepEqual(await services.survey.status(), { ok: true, submitted: false });
  assert.deepEqual(await account.logout(services, store), { ok: true, synced: true });
  cookie = "sereno_session=" + firstToken;
  assert.equal((await services.auth.session()).session, null);
  assert.equal(backend.sql("SELECT count(*) FROM sesion").rows[0][0], 0, "every logout revoked its server session");
  assert.doesNotMatch(JSON.stringify(await store.get()), /test-only-password/);
  assert.ok(calls.every((route) => route.startsWith("/v1/auth/") || route === "/v1/survey"));
  assert.equal(calls.filter((route) => route === "/v1/survey").length, 7);
});

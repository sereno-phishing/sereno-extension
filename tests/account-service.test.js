"use strict";

/* Account use cases go through the auth port only. The same behavior is
   proven against the mock adapter and the remote adapter (fake fetch). */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "account/domain/account.js",
  "history/domain/history.js",
  "survey/domain/sus.js",
  "administration/domain/domain-policy.js",
  "administration/domain/verdict-cache.js",
  "protection/domain/protection.js",
  "demo-store/domain/scenarios.js",
  "account/application/account-service.js",
  "history/application/history-service.js",
  "survey/application/survey-service.js",
  "administration/application/administration-service.js",
  "platform/storage.js",
  "platform/seed.js",
  "platform/state-store.js",
  "platform/providers/config.js",
  "platform/providers/ports.js",
  "platform/providers/mock.js",
  "platform/providers/remote.js",
  "platform/providers/index.js"
);

const { accountService, providers } = Sereno;
const NOW = new Date(2026, 8, 21, 11, 30, 0);
const BASE_URL = "https://api.sereno.test";

function backendStore() {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
}

/* The front store knows nothing of credentials: only what the use cases write. */
function frontStore() {
  return Sereno.stateStore.create({
    storage: Sereno.storage.memoryStorage(),
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: { session: null }
  });
}

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeBackend(mock) {
  return async function fetchFake(url, init) {
    const path = url.slice(BASE_URL.length);
    const body = init && init.body ? JSON.parse(init.body) : {};
    if (path === "/v1/auth/login") {
      const out = await mock.auth.login(body.username, body.password);
      return out.ok ? reply(200, out) : reply(401, out);
    }
    if (path === "/v1/auth/register") {
      const out = await mock.auth.register(body.username, body.password);
      return out.ok ? reply(201, out) : reply(out.error === "invalid" ? 400 : 409, out);
    }
    if (path === "/v1/auth/logout") {
      return reply(200, await mock.auth.logout());
    }
    if (path === "/v1/auth/session") {
      return reply(200, await mock.auth.session());
    }
    return reply(404, { error: "server" });
  };
}

function newMock() {
  return providers.mock.create({ store: backendStore(), delayMs: 0, now: () => NOW });
}

function newRemote(fetchImpl) {
  return providers.remote.create({ baseUrl: BASE_URL, timeoutMs: 50, fetch: fetchImpl });
}

const ADAPTERS = {
  mock: () => ({ auth: newMock().auth }),
  remote: () => ({ auth: newRemote(fakeBackend(newMock())).auth })
};

Object.keys(ADAPTERS).forEach((name) => {
  const services = () => ADAPTERS[name]();

  test(name + ": login stores the sanitized user and the token, never the password", async () => {
    const store = frontStore();
    const result = await accountService.login(services(), store, "admin.sereno", "sereno123", NOW);
    assert.equal(result.ok, true);
    assert.deepEqual(result.user, { username: "admin.sereno", role: "administrador", createdAt: "2026-09-01T10:00:00" });
    assert.equal(typeof result.token, "string");
    assert.ok(result.token.length > 0);
    const state = await store.get();
    assert.deepEqual(state.session, { username: "admin.sereno", role: "administrador", loginAt: "2026-09-21T11:30", token: result.token });
    assert.equal(JSON.stringify(state).includes("password"), false);
    assert.equal(JSON.stringify(result).includes("sereno123"), false);
  });

  test(name + ": login with bad credentials or bad format is invalid and opens no session", async () => {
    const store = frontStore();
    const bad = await accountService.login(services(), store, "andres.torres", "nope", NOW);
    assert.deepEqual(bad, { ok: false, error: "invalid", message: "Usuario o contraseña incorrectos." });
    const empty = await accountService.login(services(), store, "", "", NOW);
    assert.equal(empty.ok, false);
    assert.equal(empty.error, "invalid");
    assert.equal((await store.get()).session, null);
  });

  test(name + ": register signs the new user in and refuses duplicates", async () => {
    const store = frontStore();
    const svc = services();
    const duplicate = await accountService.register(svc, store, "andres.torres", "x", NOW);
    assert.deepEqual(duplicate, { ok: false, error: "duplicate", message: "El usuario ya existe." });
    assert.equal((await store.get()).session, null);
    const created = await accountService.register(svc, store, "nuevo.usuario", "clave-1", NOW);
    assert.equal(created.ok, true);
    assert.equal(created.user.username, "nuevo.usuario");
    assert.equal(created.user.role, "usuario");
    const state = await store.get();
    assert.equal(state.session.username, "nuevo.usuario");
    assert.equal(state.session.token, created.token);
    assert.equal(JSON.stringify(state).includes("password"), false);
    assert.equal(JSON.stringify(state).includes("clave-1"), false);
    const again = await accountService.login(svc, frontStore(), "nuevo.usuario", "clave-1", NOW);
    assert.equal(again.ok, true);
  });

  test(name + ": register rejects an empty password as invalid", async () => {
    const result = await accountService.register(services(), frontStore(), "nuevo", "", NOW);
    assert.deepEqual(result, { ok: false, error: "invalid", message: "Ingresa un usuario y una contraseña válidos." });
  });

  test(name + ": logout clears the local session", async () => {
    const store = frontStore();
    const svc = services();
    await accountService.login(svc, store, "andres.torres", "sereno123", NOW);
    assert.equal((await accountService.logout(svc, store)).ok, true);
    assert.equal((await store.get()).session, null);
    assert.deepEqual(await accountService.currentSession(svc, store), { ok: true, session: null, verified: true });
  });

  test(name + ": currentSession returns the signed-in session", async () => {
    const store = frontStore();
    const svc = services();
    await accountService.login(svc, store, "andres.torres", "sereno123", NOW);
    const current = await accountService.currentSession(svc, store);
    assert.equal(current.ok, true);
    assert.equal(current.session.username, "andres.torres");
    assert.equal(typeof current.session.token, "string");
  });
});

test("the mock and the remote adapter give the same use case results", async () => {
  const outcomes = [];
  for (const name of Object.keys(ADAPTERS)) {
    const svc = ADAPTERS[name]();
    const store = frontStore();
    const seen = [];
    seen.push(await accountService.login(svc, store, "andres.torres", "bad", NOW));
    seen.push(await accountService.register(svc, store, "andres.torres", "x", NOW));
    seen.push((await accountService.login(svc, store, "admin.sereno", "sereno123", NOW)).user);
    outcomes.push(seen);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test("transport failures map to typed errors with Spanish messages and never throw", async () => {
  const cases = [
    ["offline", async () => { throw new TypeError("Failed to fetch"); }, /conexión/],
    ["timeout", (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }), /tard/],
    ["server", async () => reply(500, {}), /servidor/]
  ];
  for (const [error, fetchImpl, message] of cases) {
    const store = frontStore();
    const svc = { auth: newRemote(fetchImpl).auth };
    for (const result of [
      await accountService.login(svc, store, "andres.torres", "sereno123", NOW),
      await accountService.register(svc, store, "nuevo", "x", NOW)
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.error, error);
      assert.match(result.message, message);
    }
    assert.equal((await store.get()).session, null);
  }
});

test("a port that throws or answers a malformed success is a server error", async () => {
  const store = frontStore();
  const throwing = { auth: { login: async () => { throw new Error("boom"); }, register: async () => { throw new Error("boom"); } } };
  assert.equal((await accountService.login(throwing, store, "a", "b", NOW)).error, "server");
  assert.equal((await accountService.register(throwing, store, "a", "b", NOW)).error, "server");
  const malformed = { auth: { login: async () => ({ ok: true }), register: async () => ({ ok: true, user: "nobody" }) } };
  assert.equal((await accountService.login(malformed, store, "a", "b", NOW)).error, "server");
  assert.equal((await accountService.register(malformed, store, "a", "b", NOW)).error, "server");
  const unknown = { auth: { login: async () => ({ ok: false, error: "teapot" }) } };
  assert.equal((await accountService.login(unknown, store, "a", "b", NOW)).error, "server");
  assert.equal((await store.get()).session, null);
});

test("a password in the port answer never reaches the store", async () => {
  const store = frontStore();
  const leaky = {
    auth: {
      login: async () => ({ ok: true, token: "t-1", user: { username: "u", role: "usuario", createdAt: "c", password: "leak" } })
    }
  };
  const result = await accountService.login(leaky, store, "u", "p", NOW);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(await store.get()).includes("leak"), false);
  assert.equal(JSON.stringify(result).includes("leak"), false);
});

test("logout clears the local session even when the port fails", async () => {
  const store = frontStore();
  await store.set({ session: { username: "u", role: "usuario", loginAt: "s", token: "t" } });
  const down = { auth: { logout: async () => ({ ok: false, error: "offline" }) } };
  assert.deepEqual(await accountService.logout(down, store), { ok: true, synced: false });
  assert.equal((await store.get()).session, null);
  const throwing = { auth: { logout: async () => { throw new Error("boom"); } } };
  assert.equal((await accountService.logout(throwing, store)).ok, true);
});

test("currentSession keeps the local session offline and drops it when the backend says signed out", async () => {
  const store = frontStore();
  const local = { username: "u", role: "usuario", loginAt: "s", token: "t" };
  await store.set({ session: local });
  const offline = { auth: { session: async () => ({ ok: false, error: "offline" }) } };
  assert.deepEqual(await accountService.currentSession(offline, store), { ok: true, session: local, verified: false });
  const expired = { auth: { session: async () => ({ ok: true, session: null }) } };
  assert.deepEqual(await accountService.currentSession(expired, store), { ok: true, session: null, verified: true });
  assert.equal((await store.get()).session, null);
  const cookie = { auth: { session: async () => ({ ok: true, session: { username: "c", role: "usuario", loginAt: "x" } }) } };
  const adopted = await accountService.currentSession(cookie, store);
  assert.equal(adopted.session.username, "c");
  assert.equal((await store.get()).session.username, "c");
});

test("mock and front can share one store without losing either side's writes", async () => {
  const store = backendStore();
  const mock = providers.mock.create({ store, delayMs: 0, now: () => NOW });
  const result = await accountService.register({ auth: mock.auth }, store, "compartido", "abc", NOW);
  assert.equal(result.ok, true);
  const state = await store.get();
  assert.equal(state.session.username, "compartido");
  assert.equal(state.session.token, result.token);
  assert.equal(state.users.length, 3);
  assert.equal((await accountService.login({ auth: mock.auth }, store, "compartido", "abc", NOW)).ok, true);
});

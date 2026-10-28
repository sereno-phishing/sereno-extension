"use strict";

/* Real loopback HTTP contract, not Chrome: Node has no browser cookie jar.
   Only the cookie transport is supplied here; the remote adapter is unchanged. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");
const { load } = require("./load");

const backend = path.resolve(__dirname, "../../sereno-backend");
const python = path.join(backend, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const Sereno = load(
  "time/domain/time.js", "account/domain/account.js", "account/application/account-service.js",
  "platform/storage.js", "platform/state-store.js", "platform/providers/remote.js"
);

test("extension remote auth completes the JSON session lifecycle over real loopback HTTP", {
  skip: !fs.existsSync(python) && "Sibling backend virtual environment is unavailable",
  timeout: 20000
}, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencode", "sereno-auth-"));
  const dataFile = path.join(directory, "auth.json");
  const script = [
    "from app import create_app",
    "from werkzeug.serving import make_server",
    "import sys",
    "app = create_app({'DATA_FILE': sys.argv[1], 'STORAGE_DRIVER': 'json', 'AUTH_LOCAL_HTTP': True})",
    "server = make_server('127.0.0.1', 0, app)",
    "print(server.server_port, flush=True)",
    "server.serve_forever()"
  ].join("\n");
  const child = spawn(python, ["-u", "-c", script, dataFile], { cwd: backend, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit");
      child.kill();
      await stopped;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const lines = createInterface({ input: child.stdout });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Backend startup timed out: " + diagnostics)), 5000);
    lines.once("line", (line) => { clearTimeout(timer); resolve(Number(line)); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Backend exited: " + diagnostics)); });
  });
  assert.ok(Number.isInteger(port) && port > 0);
  const baseUrl = "http://127.0.0.1:" + port;
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
  const persisted = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(persisted.sessions[firstToken].username, "throwaway");
  assert.notEqual(persisted.users.throwaway.password_hash, "test-only-password");
  await store.set({ session: null });
  assert.equal((await account.currentSession(services, store)).session.token, firstToken);
  assert.equal((await account.register(services, store, "throwaway", "test-only-password", new Date())).error, "duplicate");
  assert.deepEqual(await account.logout(services, store), { ok: true, synced: true });
  assert.equal((await account.currentSession(services, store)).session, null);
  assert.equal((await account.login(services, store, "throwaway", "wrong", new Date())).error, "invalid");
  assert.equal((await account.login(services, store, "throwaway", "test-only-password", new Date())).ok, true);
  assert.equal((await account.currentSession(services, store)).session.username, "throwaway");
  assert.deepEqual(await account.logout(services, store), { ok: true, synced: true });
  cookie = "sereno_session=" + firstToken;
  assert.equal((await services.auth.session()).session, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(dataFile, "utf8")).sessions, {});
  assert.doesNotMatch(JSON.stringify(await store.get()), /test-only-password/);
  assert.ok(calls.every((route) => route.startsWith("/v1/auth/")));
});

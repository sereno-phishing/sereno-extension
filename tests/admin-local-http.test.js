"use strict";

/* Real loopback policy contract with isolated temporary JSON. Node supplies the
   cookie jar; the production remote adapter remains unchanged. */
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
const Sereno = load("platform/providers/remote.js");

function replaceRole(dataFile, username, role) {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  data.users[username].role = role;
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

test("remote domain policies enforce live roles, persist CRUD and never fall back", {
  skip: !fs.existsSync(python) && "Sibling backend virtual environment is unavailable",
  timeout: 20000
}, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sereno-admin-"));
  const dataFile = path.join(directory, "auth.json");
  const policyFile = path.join(directory, "policies.json");
  const script = [
    "from app import create_app",
    "from werkzeug.serving import make_server",
    "import sys",
    "app = create_app({'DATA_FILE': sys.argv[1], 'POLICY_DATA_FILE': sys.argv[2], 'STORAGE_DRIVER': 'json', 'AUTH_LOCAL_HTTP': True})",
    "server = make_server('127.0.0.1', 0, app)",
    "print(server.server_port, flush=True)",
    "server.serve_forever()"
  ].join("\n");
  const child = spawn(python, ["-u", "-c", script, dataFile, policyFile], { cwd: backend, stdio: ["ignore", "pipe", "pipe"] });
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
  async function cookieFetch(url, init) {
    const response = await fetch(url, { ...init, headers: { ...init.headers, Cookie: cookie } });
    const header = response.headers.get("set-cookie");
    if (header) {
      cookie = header.split(";")[0];
    }
    return response;
  }
  const remote = Sereno.providers.remote.create({ baseUrl, timeoutMs: 500, fetch: cookieFetch });
  const registered = await remote.auth.register("policy-user", "throwaway-password");
  assert.equal(registered.ok, true);
  assert.equal(registered.user.isAdmin, false);
  assert.equal("role" in registered.user, false);

  const initialBytes = fs.readFileSync(policyFile);
  assert.deepEqual(await remote.data.getDomainPolicies(), { ok: false, error: "forbidden" });
  assert.deepEqual(await remote.data.putDomainPolicies([]), { ok: false, error: "forbidden" });
  assert.deepEqual(fs.readFileSync(policyFile), initialBytes, "user rejections do not mutate policy storage");

  replaceRole(dataFile, "policy-user", "admin");
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
  assert.deepEqual(JSON.parse(fs.readFileSync(policyFile, "utf8")), { domains: normalized });

  const validBytes = fs.readFileSync(policyFile);
  const invalid = [{ domain: "bad.example", policy: "admin", updatedAt: "2026-10-29" }];
  assert.deepEqual(await remote.data.putDomainPolicies(invalid), { ok: false, error: "invalid" });
  assert.deepEqual(fs.readFileSync(policyFile), validBytes, "invalid writes do not mutate policy storage");

  replaceRole(dataFile, "policy-user", "user");
  assert.equal((await remote.auth.session()).session.isAdmin, false);
  assert.deepEqual(await remote.data.putDomainPolicies([]), { ok: false, error: "forbidden" });
  assert.deepEqual(fs.readFileSync(policyFile), validBytes, "demoted writes do not mutate policy storage");

  const stopped = once(child, "exit");
  child.kill();
  await stopped;
  assert.deepEqual(await remote.data.getDomainPolicies(), { ok: false, error: "offline" });
  assert.deepEqual(fs.readFileSync(policyFile), validBytes, "transport failure has no mock fallback or mutation");
});

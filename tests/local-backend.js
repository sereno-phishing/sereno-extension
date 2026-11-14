/* Test-only helper for the tests that spawn the sibling backend
   (tests/*-local-http.test.js). Never loaded by the extension.

   The backend stores everything in PostgreSQL and Redis. Each test file gets
   its own store, so files can run in parallel and no developer data is ever
   read or written:
     database  sereno_extension_test_<name>, dropped and created before the
               backend starts (startup applies the schema) and dropped at the end
     Redis     its own database index, flushed before and after
   The development data lives in the database "sereno" and Redis index 0, and
   the backend's own suite uses "sereno_test" and index 15: none is touched.

   unavailable()            -> false, or the reason to skip (no virtual
                               environment, or the services are not running)
   startBackend(t, options) -> { baseUrl, stop(), sql(), redisSnapshot(), corruptCacheEntries() }
     options: { name, redisIndex, classifier? }
   The reset, the queries and the cleanup run as short Python scripts in the
   backend's virtual environment, which has psycopg and redis. */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");

const BACKEND = path.resolve(__dirname, "../../sereno-backend");
const PYTHON = path.join(BACKEND, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const POSTGRES = "postgresql://sereno:sereno@127.0.0.1:5432/";
const REDIS = "redis://127.0.0.1:6379/";
const DATABASE_PREFIX = "sereno_extension_test_";
const START_SERVICES = "docker compose up -d --wait";

/* Shared by every script: argv[1] is the database name, argv[2] the Redis index. */
const PRELUDE = [
  "import json, sys",
  "import psycopg, redis",
  "from psycopg import sql",
  "NAME, INDEX = sys.argv[1], int(sys.argv[2])",
  "POSTGRES, REDIS = " + JSON.stringify(POSTGRES) + ", " + JSON.stringify(REDIS),
  "def maintenance():",
  "    return psycopg.connect(POSTGRES + 'postgres', autocommit=True, connect_timeout=3)",
  "def cache():",
  "    return redis.Redis.from_url(REDIS + str(INDEX), decode_responses=True, socket_connect_timeout=3, socket_timeout=3)"
];

const DROP = [
  "with maintenance() as connection:",
  "    connection.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(NAME)))"
];

const FLUSH = ["client = cache()", "client.flushdb()", "client.close()"];

const SCRIPTS = {
  ping: ["maintenance().close()", "client = cache()", "client.ping()", "client.close()"],
  serve: DROP.concat([
    "with maintenance() as connection:",
    "    connection.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(NAME)))"
  ], FLUSH, [
    "from app import create_app",
    "from werkzeug.serving import make_server",
    "app = create_app({'DATABASE_URL': POSTGRES + NAME, 'REDIS_URL': REDIS + str(INDEX),",
    "                  'AUTH_LOCAL_HTTP': True, 'CLASSIFIER': sys.argv[3]})",
    "server = make_server('127.0.0.1', 0, app)",
    "print(server.server_port, flush=True)",
    "server.serve_forever()"
  ]),
  cleanup: DROP.concat(FLUSH),
  /* argv[3]: the statement, argv[4]: its parameters as a JSON array. */
  sql: [
    "with psycopg.connect(POSTGRES + NAME, autocommit=True, connect_timeout=3) as connection:",
    "    cursor = connection.execute(sys.argv[3], json.loads(sys.argv[4]))",
    "    rows = cursor.fetchall() if cursor.description else []",
    "    print(json.dumps({'rows': rows, 'count': cursor.rowcount}, default=str))"
  ],
  /* Every key of the index with its value: strings as they are, sets sorted. */
  snapshot: [
    "client = cache()",
    "found = {}",
    "for key in client.scan_iter():",
    "    found[key] = sorted(client.smembers(key)) if client.type(key) == 'set' else client.get(key)",
    "print(json.dumps(found, sort_keys=True))",
    "client.close()"
  ],
  /* Overwrites every cached entry with unparseable JSON, keeping its expiry. */
  corrupt: [
    "client = cache()",
    "broken = 0",
    "for key in client.scan_iter():",
    "    if client.type(key) == 'string':",
    "        client.set(key, '{', keepttl=True)",
    "        broken += 1",
    "print(json.dumps(broken))",
    "client.close()"
  ]
};

function run(script, args) {
  const source = PRELUDE.concat(SCRIPTS[script]).join("\n");
  return spawnSync(PYTHON, ["-c", source, ...args.map(String)], { cwd: BACKEND, encoding: "utf8", timeout: 20000 });
}

function output(script, args) {
  const result = run(script, args);
  assert.equal(result.status, 0, script + " failed: " + (result.stderr || result.error));
  return JSON.parse(result.stdout);
}

/* Checked once per test file, before any test is registered. */
function unavailable() {
  if (!fs.existsSync(PYTHON)) {
    return "Sibling backend virtual environment is unavailable";
  }
  if (run("ping", ["postgres", 14]).status !== 0) {
    return "PostgreSQL or Redis is not running: run '" + START_SERVICES + "' in ..\\sereno-backend";
  }
  return false;
}

async function startBackend(t, options) {
  const name = DATABASE_PREFIX + options.name;
  const index = options.redisIndex;
  assert.match(name, /^sereno_extension_test_[a-z]+$/, "an isolated test database");
  assert.ok(Number.isInteger(index) && index >= 1 && index <= 14, "a Redis index that is neither development (0) nor the backend suite (15)");
  const args = [name, index];

  const source = PRELUDE.concat(SCRIPTS.serve).join("\n");
  const child = spawn(PYTHON, ["-u", "-c", source, name, String(index), options.classifier || "fake"], { cwd: BACKEND, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });

  async function stop() {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit");
      child.kill();
      await stopped;
    }
  }

  /* Nothing is left behind: the database is dropped and the index flushed. */
  t.after(async () => {
    await stop();
    const cleaned = run("cleanup", args);
    assert.equal(cleaned.status, 0, "cleanup failed: " + (cleaned.stderr || cleaned.error));
  });

  const lines = createInterface({ input: child.stdout });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Backend startup timed out: " + diagnostics)), 30000);
    lines.once("line", (line) => { clearTimeout(timer); resolve(Number(line)); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Backend exited: " + diagnostics)); });
  });
  assert.ok(Number.isInteger(port) && port > 0);

  return {
    baseUrl: "http://127.0.0.1:" + port,
    stop,
    /* -> { rows, count }: rows as arrays, dates and timestamps as text. */
    sql: (statement, parameters) => output("sql", args.concat([statement, JSON.stringify(parameters || [])])),
    redisSnapshot: () => output("snapshot", args),
    corruptCacheEntries: () => output("corrupt", args)
  };
}

module.exports = { unavailable, startBackend };

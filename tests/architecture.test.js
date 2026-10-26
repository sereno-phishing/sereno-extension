"use strict";

/* Only the provider seam may know about the network or about adapters:
   everything else depends on the ports through Sereno.services. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".claude", ".codegraph", ".agents", ".atl", ".codex", "odd"]);
const FORBIDDEN = [
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
  { name: "new WebSocket", pattern: /new\s+WebSocket/ },
  { name: "Sereno.providers.mock", pattern: /Sereno\.providers\.mock/ },
  { name: "Sereno.providers.remote", pattern: /Sereno\.providers\.remote/ }
];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const relative = path.relative(ROOT, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      const skipped = SKIPPED_DIRS.has(entry.name) || relative === "tests" || relative === "platform/providers";
      return skipped ? [] : sourceFiles(full);
    }
    return entry.name.endsWith(".js") ? [relative] : [];
  });
}

test("the scan covers the extension sources", () => {
  const files = sourceFiles(ROOT);
  assert.ok(files.includes("platform/state-store.js"));
  assert.ok(files.length > 20);
  assert.ok(!files.some((file) => file.startsWith("tests/") || file.startsWith("platform/providers/")));
});

test("only platform/providers touches the network or adapters", () => {
  const offenders = [];
  sourceFiles(ROOT).forEach((file) => {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    FORBIDDEN.forEach((rule) => {
      if (rule.pattern.test(text)) {
        offenders.push(file + " uses " + rule.name);
      }
    });
  });
  assert.deepEqual(offenders, []);
});

/* The provider switch is one file. Only the composition root reads it, and
   the backend address lives in it and nowhere else. */

function providerFiles() {
  return fs.readdirSync(path.join(ROOT, "platform", "providers")).map((name) => "platform/providers/" + name);
}

test("only the composition root reads Sereno.providers.config", () => {
  const readers = sourceFiles(ROOT)
    .concat(providerFiles())
    .filter((file) => /providers\.config\b/.test(fs.readFileSync(path.join(ROOT, file), "utf8")))
    .filter((file) => file !== "platform/providers/config.js")
    .sort();
  assert.deepEqual(readers, ["platform/providers/index.js"]);
});

test("config.js is the only file that holds the backend address", () => {
  const holders = sourceFiles(ROOT)
    .concat(providerFiles())
    .filter((file) => /\bbaseUrl\b/.test(fs.readFileSync(path.join(ROOT, file), "utf8")))
    .sort();
  /* index.js passes the value on and remote.js consumes it; neither stores one. */
  assert.deepEqual(holders, ["platform/providers/config.js", "platform/providers/index.js", "platform/providers/remote.js"]);

  const literal = /baseUrl\s*:\s*["'`][^"'`]+["'`]/;
  const withValue = holders.filter((file) => file !== "platform/providers/config.js" && literal.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
  assert.deepEqual(withValue, [], "no other file hard-codes a backend address");
});

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

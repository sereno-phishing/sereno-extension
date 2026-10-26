"use strict";

/* Manifest sanity for the content script: every referenced file exists, the
   js list is in dependency order, and only the declared files are exposed. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const exists = (file) => fs.existsSync(path.join(ROOT, file));

test("the manifest is Manifest V3 and still declares the worker", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
});

test("one content script runs on web pages only, at idle, in the top frame", () => {
  assert.equal(manifest.content_scripts.length, 1);
  const entry = manifest.content_scripts[0];
  assert.deepEqual(entry.matches, ["http://*/*", "https://*/*"]);
  assert.equal(entry.run_at, "document_idle");
  assert.equal(entry.all_frames, false);
  assert.ok(entry.js.length > 5);
  entry.js.forEach((file) => assert.ok(exists(file), file + " exists"));
  assert.equal(new Set(entry.js).size, entry.js.length);
});

test("the content script js list is in dependency order and ends with the container", () => {
  const js = manifest.content_scripts[0].js;
  const at = (file) => {
    const index = js.indexOf(file);
    assert.ok(index >= 0, file + " is listed");
    return index;
  };
  assert.equal(js[js.length - 1], "content/content-script.js");
  assert.ok(at("platform/browser.js") < at("content/content-script.js"));
  assert.ok(at("verdict/domain/verdict.js") < at("verdict/domain/outcome.js"));
  assert.ok(at("ui/atoms.js") < at("verdict/ui/verdict-ui.js"));
  assert.ok(at("verdict/ui/verdict-ui.js") < at("demo-store/ui/verdict-modal.js"));
  assert.ok(at("demo-store/ui/verdict-modal.js") < at("verdict/ui/page-overlay.js"));
  assert.ok(at("verdict/ui/page-overlay.js") < at("content/content-script.js"));
});

test("the content script never loads the provider seam, the services or any page container", () => {
  manifest.content_scripts[0].js.forEach((file) => {
    assert.doesNotMatch(file, /platform\/providers|-page\.js|-service\.js|\/application\//, file);
  });
});

test("web accessible resources exist, are limited to web pages and cover what the shadow root loads", () => {
  assert.equal(manifest.web_accessible_resources.length, 1);
  const entry = manifest.web_accessible_resources[0];
  assert.deepEqual(entry.matches, ["http://*/*", "https://*/*"]);
  entry.resources.forEach((resource) => {
    const files = resource.includes("*") ? fs.readdirSync(path.join(ROOT, path.dirname(resource))).filter((name) => name.endsWith(path.extname(resource))) : [path.basename(resource)];
    assert.ok(files.length > 0, resource + " matches files");
    files.forEach((name) => assert.ok(exists(path.posix.join(path.posix.dirname(resource), name)), resource));
  });
  ["ui/tokens.css", "ui/verdict-modal.css", "content/content.css", "assets/logo.png", "assets/icons/*.svg"].forEach((resource) => {
    assert.ok(entry.resources.includes(resource), resource + " is exposed");
  });
  assert.ok(!entry.resources.some((resource) => /\.js$|\*\*|^\*$/.test(resource)), "no scripts and no broad globs");
});

test("permissions stay as before; the content script is declared, not injected with scripting", () => {
  assert.deepEqual(manifest.permissions, ["storage", "tabs"]);
  assert.equal(manifest.host_permissions, undefined);
});

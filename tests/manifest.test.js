"use strict";

/* Manifest sanity: what Chrome and the store reviewer read. Every referenced
   file exists, the content script list is in dependency order, nothing is exposed to
   web pages, and host_permissions follow the
   provider config (the third touch point of a backend hand-off). */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const exists = (file) => fs.existsSync(path.join(ROOT, file));

load("platform/providers/config.js");
const CONFIG = globalThis.Sereno.providers.config;

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

test("nothing is exposed to web pages: no web_accessible_resources, so a page cannot probe or load extension files", () => {
  assert.equal(manifest.web_accessible_resources, undefined);
});

test("the generated assets load after the icon atoms and before the container that reads them", () => {
  const js = manifest.content_scripts[0].js;
  const generated = js.indexOf("content/content-assets.generated.js");
  assert.ok(generated >= 0, "the bundle is listed");
  assert.ok(js.indexOf("ui/atoms.js") < generated);
  assert.ok(generated < js.indexOf("content/content-script.js"));
  assert.equal(manifest.content_scripts[0].css, undefined, "styles come from the bundle, not from the manifest");
});

test("the content script and the views it loads never name an extension URL or the stylesheet files", () => {
  const script = fs.readFileSync(path.join(ROOT, "content", "content-script.js"), "utf8");
  assert.doesNotMatch(script.replace(/\/\*[\s\S]*?\*\//g, ""), /assetUrl|chrome-extension|\.css"|createElement\("link"\)|getURL/);
});

test("the store listing identity is final: product name, a real description, a release version", () => {
  assert.equal(manifest.name, "Sereno");
  assert.equal(manifest.short_name, "Sereno");
  [manifest.name, manifest.short_name, manifest.description].forEach((text) => {
    assert.doesNotMatch(text, /prototipo|sprint|demo|sin backend/i, text);
  });
  assert.equal(typeof manifest.description, "string");
  assert.ok(manifest.description.length >= 40 && manifest.description.length <= 132, "description length " + manifest.description.length);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.notEqual(manifest.version, "0.1.0");
});

test("the minimum Chrome version covers the APIs in use", () => {
  /* chrome.storage.session and the inert attribute need 102; the service
     worker, chrome.action and :where() need 88 or less. */
  assert.equal(manifest.minimum_chrome_version, "102");
});

test("extension pages get an explicit strict CSP", () => {
  assert.deepEqual(manifest.content_security_policy, { extension_pages: "script-src 'self'; object-src 'self'" });
});

test("every icon and page the manifest names is a real file", () => {
  const icons = Object.values(manifest.icons).concat(Object.values(manifest.action.default_icon));
  assert.ok(icons.length >= 8);
  icons.forEach((file) => assert.ok(exists(file), file));
  assert.ok(exists(manifest.action.default_popup));
  assert.ok(exists(manifest.options_page));
});

test("permissions: storage and tabs only, nothing that injects or reads page content", () => {
  assert.deepEqual(manifest.permissions, ["storage", "tabs"]);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
});

test("host_permissions follow the provider config: empty for the mock, exactly the backend origin for remote", () => {
  assert.ok(Array.isArray(manifest.host_permissions), "the key is present so the hand-off is a one-line edit");
  manifest.host_permissions.forEach((pattern) => {
    assert.match(pattern, /^https:\/\/[a-z0-9.-]+(:\d+)?\/\*$/, "one https origin, no wildcard host: " + pattern);
  });
  if (CONFIG.provider === "remote") {
    assert.ok(CONFIG.baseUrl.startsWith("https://"), "the backend is reached over https");
    assert.deepEqual(manifest.host_permissions, [new URL(CONFIG.baseUrl).origin + "/*"]);
  } else {
    assert.deepEqual(manifest.host_permissions, []);
  }
});

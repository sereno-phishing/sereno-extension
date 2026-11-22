"use strict";

/* Chrome Web Store package (scripts/store-package.js): the uploaded manifest
   drops the loopback development host permission and nothing else, the zip
   carries exactly the files the manifest, the pages, the service worker and
   the stylesheets load (plus the asset, icon and locale folders), and nothing
   that only serves development. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const store = require("../scripts/store-package.js");
const generator = require("../tools/build-content-assets.js");

const ROOT = path.join(__dirname, "..");
const LOOPBACK = "http://127.0.0.1:5000/*";
const readText = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const manifest = JSON.parse(readText("manifest.json"));
const tracked = store.trackedFiles(ROOT);

test("the packaged manifest drops only the loopback development host permission", () => {
  const original = JSON.parse(JSON.stringify(manifest));
  const packaged = store.storeManifest(manifest);

  assert.ok(!packaged.host_permissions.includes(LOOPBACK));
  assert.deepEqual(packaged.host_permissions, ["https://sereno-phishing.chilecentral.cloudapp.azure.com/*"]);
  assert.deepEqual(packaged, { ...original, host_permissions: original.host_permissions.filter((entry) => entry !== LOOPBACK) });
  assert.deepEqual(manifest, original, "the repository manifest object is not mutated");
});

test("the packaged manifest refuses any other plain-HTTP host permission", () => {
  const withHttp = { ...manifest, host_permissions: manifest.host_permissions.concat("http://example.com/*") };
  assert.throws(() => store.storeManifest(withHttp), /http:\/\/example\.com/);
});

test("referenced files follow the manifest, the pages, the worker imports and the stylesheets", () => {
  const referenced = store.referencedFiles(manifest, readText);

  [
    "manifest.json",
    "_locales/es/messages.json",
    "background/service-worker.js",
    "platform/providers/remote.js",
    "protection/application/navigation-service.js",
    "content/content-assets.generated.js",
    "content/content-script.js",
    "app/popup/popup.html",
    "app/popup/popup-page.js",
    "app/admin/admin.html",
    "app/admin/admin.css",
    "ui/tokens.css",
    "assets/fonts/inter-latin-wght-normal.woff2",
    "icons/icon128.png"
  ].forEach((file) => assert.ok(referenced.includes(file), file + " is referenced"));
  referenced.forEach((file) => assert.ok(fs.existsSync(path.join(ROOT, file)), file + " exists"));
  assert.ok(!referenced.includes("content/content.css"), "bundled into content-assets.generated.js, never loaded");
});

test("dev-only paths are recognised", () => {
  [
    "tests/manifest.test.js",
    "odd/tasks/store-package.md",
    "scripts/store-package.js",
    "tools/build-content-assets.js",
    ".agents/skills/x/SKILL.md",
    ".gitignore",
    "README.md",
    "CHROMEWEBSTORE.md",
    "dist/sereno-0.3.0.zip",
    "node_modules/a/index.js",
    "assets/icons/Thumbs.db",
    "assets/desktop.ini"
  ].forEach((file) => assert.equal(store.isDevOnly(file), true, file));
  ["manifest.json", "platform/storage.js", "assets/logo.png", "_locales/en/messages.json"].forEach((file) =>
    assert.equal(store.isDevOnly(file), false, file)
  );
});

test("the package holds every tracked runtime file except the content-asset build inputs, and no dev file", () => {
  const files = store.packageFiles(manifest, readText, tracked);
  const referenced = store.referencedFiles(manifest, readText);

  assert.deepEqual(store.checkPackage(files, (file) => fs.existsSync(path.join(ROOT, file))), []);
  referenced.forEach((file) => assert.ok(files.includes(file), file + " is packaged"));
  tracked
    .filter((file) => /^(assets|icons|_locales)\//.test(file))
    .forEach((file) => assert.ok(files.includes(file), file + " is packaged"));

  const leftOut = tracked.filter((file) => !store.isDevOnly(file) && !files.includes(file)).sort();
  const buildInputs = generator.STYLES.filter((file) => !referenced.includes(file)).sort();
  assert.deepEqual(leftOut, buildInputs);
  assert.deepEqual(buildInputs, ["content/content.css", "ui/verdict-modal.css"]);
});

test("checkPackage reports missing and dev-only files", () => {
  const problems = store.checkPackage(["manifest.json", "tests/x.test.js", "gone.js"], (file) => file !== "gone.js");
  assert.deepEqual(problems, ["dev-only file in package: tests/x.test.js", "missing file: gone.js"]);
});

test("a packaged script that still names a dropped development origin stops the build", () => {
  const entries = [
    { name: "platform/providers/config.js", data: Buffer.from('{ url: "http://127.0.0.1:5000" }') },
    { name: "ui/atoms.js", data: Buffer.from("var x = 1;") }
  ];
  assert.deepEqual(store.devOriginReferences(entries, [LOOPBACK]), ["platform/providers/config.js names http://127.0.0.1:5000"]);
  assert.deepEqual(store.devOriginReferences(entries.slice(1), [LOOPBACK]), []);
});

test("the zip writer round-trips entries, is deterministic and stores incompressible data", () => {
  const entries = [
    { name: "b/text.txt", data: Buffer.from("hola ".repeat(200)) },
    { name: "a.bin", data: Buffer.from([0, 1, 2, 3]) },
    { name: "empty.txt", data: Buffer.alloc(0) }
  ];
  const zip = store.createZip(entries);
  assert.ok(zip.equals(store.createZip(entries.slice().reverse())), "same bytes whatever the input order");

  const read = store.readZip(zip);
  assert.deepEqual(read.map((entry) => entry.name), ["a.bin", "b/text.txt", "empty.txt"]);
  read.forEach((entry) => {
    const source = entries.find((candidate) => candidate.name === entry.name);
    assert.ok(entry.data.equals(source.data), entry.name);
  });
  assert.equal(read.find((entry) => entry.name === "a.bin").method, 0, "stored when deflate would not shrink it");
  assert.equal(read.find((entry) => entry.name === "b/text.txt").method, 8, "deflated text");
});

test("build writes dist/sereno-<version>.zip with the store manifest and the untouched runtime files", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sereno-store-"));
  try {
    const result = store.build({ root: ROOT, outDir });
    assert.equal(path.basename(result.path), "sereno-" + manifest.version + ".zip");
    assert.equal(result.size, fs.statSync(result.path).size);

    const entries = store.readZip(fs.readFileSync(result.path));
    const names = entries.map((entry) => entry.name);
    assert.deepEqual(names, store.packageFiles(manifest, readText, tracked));
    assert.equal(result.count, names.length);
    entries.forEach((entry) => {
      if (entry.name === "manifest.json") {
        assert.deepEqual(JSON.parse(entry.data.toString("utf8")), store.storeManifest(manifest));
      } else {
        assert.ok(entry.data.equals(fs.readFileSync(path.join(ROOT, entry.name))), entry.name + " is byte-identical");
      }
    });

    const systemTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    if (process.platform === "win32" && fs.existsSync(systemTar)) {
      const listed = execFileSync(systemTar, ["-tf", result.path], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
      assert.deepEqual(listed.sort(), names.slice().sort(), "Windows bsdtar reads the same entries");
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

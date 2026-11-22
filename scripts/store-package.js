"use strict";

/* Builds the Chrome Web Store upload: dist/sereno-<version>.zip.

     node scripts/store-package.js

   - manifest.json is packaged without the development host permissions
     (DEV_HOST_PERMISSIONS); every other field stays identical. The repository
     manifest keeps them for local work.
   - Files follow the references: the manifest (worker, content scripts, pages,
     icons, default locale), the <script>/<link>/<img> tags of each page, the
     worker's importScripts list and the url()s of every linked stylesheet.
     assets/, icons/ and _locales/ ship whole because the views name icons at
     run time. Only files tracked by git are taken from those folders.
   - The build stops if a file is missing, if a dev-only path slipped in, or if
     a packaged script still names a dropped development origin (for example,
     platform/providers/config.js left pointing at the loopback backend).
   - The zip is written here with node:zlib (deflate + CRC-32), no npm
     dependency and no system zip tool: entries are sorted and dated
     1980-01-01, so the same sources give the same bytes on any OS. It is read
     back and checked before the script reports success. */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DEV_HOST_PERMISSIONS = ["http://127.0.0.1:5000/*"];
const WHOLE_DIRS = ["assets/", "icons/", "_locales/"];
const DEV_DIRS = ["tests", "odd", "scripts", "tools", "dist", "docs", "node_modules", ".agents", ".atl", ".claude", ".codegraph", ".codex", ".git", ".github"];
const DEV_NAMES = ["thumbs.db", "desktop.ini", "skills-lock.json", "package.json", "package-lock.json"];

/* ---------------- manifest ---------------- */

function storeManifest(manifest) {
  const packaged = JSON.parse(JSON.stringify(manifest));
  packaged.host_permissions = (manifest.host_permissions || []).filter((entry) => !DEV_HOST_PERMISSIONS.includes(entry));
  const plainHttp = packaged.host_permissions.filter((entry) => !entry.startsWith("https://"));
  if (plainHttp.length) {
    throw new Error("Only HTTPS host permissions may ship to the store: " + plainHttp.join(", "));
  }
  return packaged;
}

/* ---------------- file selection ---------------- */

function isDevOnly(file) {
  const parts = file.split("/");
  const name = parts[parts.length - 1].toLowerCase();
  return (
    DEV_DIRS.includes(parts[0]) ||
    parts.some((part) => part.startsWith(".")) ||
    name.endsWith(".md") ||
    name.endsWith(".map") ||
    name.endsWith(".zip") ||
    /\.test\.js$/.test(name) ||
    DEV_NAMES.includes(name)
  );
}

function resolve(from, reference) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), reference));
}

function isLocal(reference) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference);
}

function pageReferences(page, html) {
  return Array.from(html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"#?]+)"/g))
    .map((match) => match[1])
    .filter(isLocal)
    .map((reference) => resolve(page, reference));
}

function cssReferences(sheet, css) {
  return Array.from(css.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/g))
    .map((match) => match[1].split(/[?#]/)[0])
    .filter(isLocal)
    .map((reference) => resolve(sheet, reference));
}

function workerImports(worker, source) {
  const call = /importScripts\s*\(([\s\S]*?)\)/.exec(source);
  if (!call) return [];
  return Array.from(call[1].matchAll(/["']([^"']+)["']/g)).map((match) => resolve(worker, match[1]));
}

/* Every file the manifest names, directly or through a page, the worker or a
   stylesheet. readText(file) returns the file's text (repo-relative path). */
function referencedFiles(manifest, readText) {
  const found = new Set(["manifest.json"]);
  const add = (file) => {
    if (file) found.add(file);
  };

  if (manifest.default_locale) add("_locales/" + manifest.default_locale + "/messages.json");
  Object.values(manifest.icons || {}).forEach(add);
  Object.values((manifest.action && manifest.action.default_icon) || {}).forEach(add);
  (manifest.content_scripts || []).forEach((entry) => (entry.js || []).concat(entry.css || []).forEach(add));

  const worker = manifest.background && manifest.background.service_worker;
  if (worker) {
    add(worker);
    workerImports(worker, readText(worker)).forEach(add);
  }

  const pages = [manifest.action && manifest.action.default_popup, manifest.options_page, manifest.options_ui && manifest.options_ui.page]
    .filter(Boolean);
  pages.forEach((page) => {
    add(page);
    pageReferences(page, readText(page)).forEach((file) => {
      add(file);
      if (file.endsWith(".css")) cssReferences(file, readText(file)).forEach(add);
    });
  });

  return Array.from(found).sort();
}

function packageFiles(manifest, readText, tracked) {
  const files = new Set(referencedFiles(manifest, readText));
  tracked.filter((file) => WHOLE_DIRS.some((dir) => file.startsWith(dir)) && !isDevOnly(file)).forEach((file) => files.add(file));
  return Array.from(files).sort();
}

function checkPackage(files, exists) {
  const problems = [];
  files.filter(isDevOnly).forEach((file) => problems.push("dev-only file in package: " + file));
  files.filter((file) => !exists(file)).forEach((file) => problems.push("missing file: " + file));
  return problems;
}

/* A packaged script that still names an origin the packaged manifest no longer
   grants would fail at run time (CORS without host permission). */
function devOriginReferences(entries, droppedPermissions) {
  const origins = droppedPermissions.map((entry) => entry.replace(/\/\*$/, ""));
  const found = [];
  entries
    .filter((entry) => /\.(js|html|json)$/.test(entry.name) && entry.name !== "manifest.json")
    .forEach((entry) => {
      const text = entry.data.toString("utf8");
      origins.filter((origin) => text.includes(origin)).forEach((origin) => found.push(entry.name + " names " + origin));
    });
  return found;
}

function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .sort();
}

/* ---------------- zip ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; /* 1980-01-01 */

function createZip(entries) {
  const sorted = entries.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;

  sorted.forEach((entry) => {
    const name = Buffer.from(entry.name, "utf8");
    const deflated = zlib.deflateRawSync(entry.data, { level: 9 });
    const method = deflated.length < entry.data.length ? 8 : 0;
    const body = method === 8 ? deflated : entry.data;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  });

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([directory, end]));
}

/* Reads back what createZip writes (no zip64, no data descriptors). */
function readZip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("Not a zip file: no end of central directory");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("Corrupt central directory at " + at);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    if (crc32(data) !== crc) throw new Error("CRC mismatch: " + name);
    entries.push({ name, method, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/* ---------------- build ---------------- */

function build(options) {
  const root = (options && options.root) || ROOT;
  const outDir = (options && options.outDir) || path.join(root, "dist");
  const readText = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const manifest = JSON.parse(readText("manifest.json"));
  const packaged = storeManifest(manifest);
  const dropped = (manifest.host_permissions || []).filter((entry) => !packaged.host_permissions.includes(entry));
  const files = packageFiles(manifest, readText, trackedFiles(root));

  const problems = checkPackage(files, (file) => fs.existsSync(path.join(root, file)));
  if (problems.length) throw new Error("Package check failed:\n  " + problems.join("\n  "));

  const entries = files.map((file) => ({
    name: file,
    data: file === "manifest.json" ? Buffer.from(JSON.stringify(packaged, null, 2) + "\n", "utf8") : fs.readFileSync(path.join(root, file))
  }));
  const stale = devOriginReferences(entries, dropped);
  if (stale.length) {
    throw new Error("Packaged files still use a development origin the store manifest drops:\n  " + stale.join("\n  "));
  }

  const zip = createZip(entries);
  const check = readZip(zip);
  if (check.length !== entries.length || check.some((entry, index) => entry.name !== files[index] || !entry.data.equals(entries[index].data))) {
    throw new Error("The written zip does not read back as the selected files");
  }

  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, "sereno-" + manifest.version + ".zip");
  fs.writeFileSync(target, zip);
  return { path: target, size: zip.length, count: entries.length, files, dropped };
}

function main() {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) console.warn("Warning: the working tree has uncommitted changes; the zip uses the files as they are on disk.");
  const result = build({ root: ROOT });
  console.log("Wrote " + path.relative(ROOT, result.path) + " (" + result.size + " bytes, " + result.count + " files).");
  console.log("Dropped from host_permissions: " + (result.dropped.join(", ") || "nothing"));
  return 0;
}

module.exports = {
  DEV_HOST_PERMISSIONS,
  storeManifest,
  isDevOnly,
  referencedFiles,
  packageFiles,
  checkPackage,
  devOriginReferences,
  trackedFiles,
  createZip,
  readZip,
  build
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
/* Dev step (not part of the extension at runtime): bundles the styles and the
   icons the in-page UI needs into one generated classic script,
   content/content-assets.generated.js, which registers Sereno.contentAssets.

   A content script must not make the page load chrome-extension:// URLs, so the
   in-page UI gets its CSS (adopted as a constructable stylesheet) and its icons
   (inline svg) from that bundle instead of from <link> and <img> elements.

     node tools/build-content-assets.js           writes the bundle
     node tools/build-content-assets.js --check   exits 1 if it is out of date

   Plain Node, no dependencies. The output is deterministic: fixed source order,
   icons sorted by name and LF line endings whatever the sources use. */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = "content/content-assets.generated.js";

/* Order matters: tokens first (variables on :host), then the shared card, then
   what the page container adds around it. */
const STYLES = ["ui/tokens.css", "ui/verdict-modal.css", "content/content.css"];

/* Icons the in-page views render (assets/icons/<name>.svg). The logo of the
   modal footer is drawn with "brand": a data: image would still be subject to
   the page's img-src policy, inline svg is not. */
const ICONS = ["alert-bad-14", "alert-bad-44", "alert-warn-14", "alert-warn-44", "brand", "toast-pending-32"];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
}

/* Comments and @font-face are dropped: the face points at a file relative to
   the extension page and, inside a foreign page, would resolve against the
   page's own URL (and a shadow root cannot register fonts anyway). */
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function cleanSvg(name, svg) {
  if (/url\(#|xlink:href|<script|<image|<img|\son\w+=/i.test(svg)) {
    throw new Error("assets/icons/" + name + ".svg references something outside itself");
  }
  return svg
    .replace(/\sid="[^"]*"/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .replace(/\s>/g, ">")
    .trim();
}

function build() {
  const css = STYLES.map((file) => minifyCss(read(file))).join("\n");
  const icons = ICONS.slice().sort().map((name) => {
    const svg = cleanSvg(name, read("assets/icons/" + name + ".svg"));
    return "      " + JSON.stringify(name) + ": " + JSON.stringify(svg);
  });
  return [
    "/* GENERATED FILE - do not edit.",
    "   Regenerate with: node tools/build-content-assets.js",
    "   Sources: " + STYLES.join(", ") + " and assets/icons/{" + ICONS.slice().sort().join(",") + "}.svg",
    "   Classic script: registers Sereno.contentAssets = { css, icons } for the content",
    "   script, so the page never has to load a chrome-extension:// URL. */",
    "",
    "(function (Sereno) {",
    '  "use strict";',
    "",
    "  Sereno.contentAssets = {",
    "    css: " + JSON.stringify(css) + ",",
    "    icons: {",
    icons.join(",\n"),
    "    }",
    "  };",
    "})(globalThis.Sereno = globalThis.Sereno || {});",
    ""
  ].join("\n");
}

function main(argv) {
  const target = path.join(ROOT, OUTPUT);
  const next = build();
  if (argv.includes("--check")) {
    let current = null;
    try {
      current = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    } catch (error) {
      current = null;
    }
    if (current !== next) {
      console.error(OUTPUT + " is out of date. Run: node tools/build-content-assets.js");
      return 1;
    }
    console.log(OUTPUT + " is up to date.");
    return 0;
  }
  fs.writeFileSync(target, next, "utf8");
  console.log("Wrote " + OUTPUT + " (" + next.length + " characters).");
  return 0;
}

module.exports = { OUTPUT, STYLES, ICONS, build };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

/* Loads Sereno classic scripts into Node. Each file is an IIFE that registers
   itself on globalThis.Sereno, exactly as in the browser, so tests exercise
   the same files the pages load. */

"use strict";

const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function load(...files) {
  files.forEach((file) => require(path.join(ROOT, file)));
  return globalThis.Sereno;
}

module.exports = { load };

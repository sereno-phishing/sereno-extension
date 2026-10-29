"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

test("privacy follows saved language and external changes without replacing nodes", async () => {
  let watch;
  const node = { textContent: "" , getAttribute: () => "privacy.heading" };
  const doc = { documentElement: {}, querySelectorAll: () => [node] };
  const context = vm.createContext({ document: doc, navigator: { language: "es" }, Sereno: { storage: { detect: () => ({ get: async () => "en", watch: (key, cb) => { watch = cb; } }) } } });
  vm.runInContext(fs.readFileSync("platform/i18n.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("app/privacy/privacy-language.js", "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(node.textContent, "Sereno privacy policy");
  assert.equal(doc.documentElement.lang, "en");
  watch("es");
  assert.equal(node.textContent, "Política de privacidad de Sereno");
  assert.equal(doc.documentElement.lang, "es");
});

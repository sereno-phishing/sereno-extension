"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { domainPolicy, verdictCache } = load("administration/domain/domain-policy.js", "administration/domain/verdict-cache.js");

const STORED = [
  { domain: "pago-servicios-linea.net", policy: "bloqueo", updatedAt: "2026-09-21" },
  { domain: "paypal-secure-login.com", policy: "advertencia", updatedAt: "2026-09-20" }
];

test("policies: two options, warning by default", () => {
  assert.deepEqual(domainPolicy.POLICY_IDS, ["advertencia", "bloqueo"]);
  assert.equal(domainPolicy.DEFAULT_POLICY, "advertencia");
  assert.equal(domainPolicy.POLICIES.bloqueo.label, "Bloqueo duro");
  assert.equal(domainPolicy.isPolicy("seguro"), false);
  assert.equal(domainPolicy.policyOrDefault("bloqueo"), "bloqueo");
  assert.equal(domainPolicy.policyOrDefault("otra"), "advertencia");
});

test("domains are normalized to trimmed lower case", () => {
  assert.equal(domainPolicy.normalizeDomain("  Nuevo-Dominio.PE "), "nuevo-dominio.pe");
  assert.equal(domainPolicy.normalizeDomain(undefined), "");
});

test("addRow puts a new domain first and ignores listed ones", () => {
  const added = domainPolicy.addRow(STORED, "nuevo.pe", "bloqueo", "2026-09-22");
  assert.deepEqual(added.added, { domain: "nuevo.pe", policy: "bloqueo", updatedAt: "2026-09-22" });
  assert.deepEqual(added.rows.map((row) => row.domain), ["nuevo.pe", "pago-servicios-linea.net", "paypal-secure-login.com"]);
  const duplicate = domainPolicy.addRow(STORED, "paypal-secure-login.com", "bloqueo", "2026-09-22");
  assert.equal(duplicate.added, null);
  assert.deepEqual(duplicate.rows, STORED);
});

test("upsertFirst replaces a stored row and keeps the rest", () => {
  const rows = domainPolicy.upsertFirst(STORED, { domain: "paypal-secure-login.com", policy: "bloqueo", updatedAt: "x", extra: 1 });
  assert.deepEqual(rows, [{ domain: "paypal-secure-login.com", policy: "bloqueo", updatedAt: "x" }, STORED[0]]);
});

test("withPolicy and without edit the draft immutably", () => {
  const changed = domainPolicy.withPolicy(STORED, "pago-servicios-linea.net", "advertencia");
  assert.equal(changed[0].policy, "advertencia");
  assert.equal(changed[0].updatedAt, "2026-09-21");
  assert.equal(STORED[0].policy, "bloqueo");
  assert.deepEqual(domainPolicy.without(STORED, "pago-servicios-linea.net"), [STORED[1]]);
});

test("stampChanges dates only new rows and changed policies", () => {
  const draft = [
    { domain: "nuevo.pe", policy: "advertencia", updatedAt: "2026-01-01" },
    { domain: "pago-servicios-linea.net", policy: "advertencia", updatedAt: "2026-09-21" },
    { domain: "paypal-secure-login.com", policy: "advertencia", updatedAt: "2026-09-20" }
  ];
  assert.deepEqual(domainPolicy.stampChanges(draft, STORED, "2026-09-30").map((row) => row.updatedAt), [
    "2026-09-30",
    "2026-09-30",
    "2026-09-20"
  ]);
});

test("TTL accepts positive integers only", () => {
  const cache = { ttlPhishingDays: 7, ttlLegitHours: 24, invalidations: [] };
  assert.deepEqual(verdictCache.withTtl(cache, "10", "0"), { ttlPhishingDays: 10, ttlLegitHours: 24, invalidations: [] });
  assert.deepEqual(verdictCache.withTtl(cache, "-3", "48h"), { ttlPhishingDays: 7, ttlLegitHours: 48, invalidations: [] });
  assert.deepEqual(verdictCache.withTtl(cache, "", "abc"), cache);
  assert.equal(cache.ttlPhishingDays, 7);
  assert.equal(verdictCache.parseTtl("2.9"), 2);
});

test("an invalidation is added first as pending re-evaluation", () => {
  const cache = { ttlPhishingDays: 7, invalidations: [{ domain: "old.pe", status: "Reevaluado: seguro", date: "2026-09-18" }] };
  const next = verdictCache.withInvalidation(cache, "ejemplo.pe", "21/09/2026");
  assert.deepEqual(next.invalidations[0], { domain: "ejemplo.pe", status: "Se reevaluará en la próxima consulta", date: "21/09/2026" });
  assert.equal(next.invalidations.length, 2);
  assert.equal(cache.invalidations.length, 1);
  assert.equal(verdictCache.withInvalidation({}, "a.pe", "d").invalidations.length, 1);
});

"use strict";

/* Outcome model: provider results and errors become one of three kinds
   (verdict, pending, degraded). Pure rules, no provider involved. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { verdictOutcome: outcome } = load("verdict/domain/verdict.js", "verdict/domain/outcome.js");

const GOOD = { ok: true, domain: "a.pe", status: "advertencia", score: 0.9, source: "modelo", latencyMs: 120 };

test("a successful provider result becomes a verdict outcome", () => {
  assert.deepEqual(outcome.fromResult(GOOD), {
    kind: "verdict",
    verdict: { domain: "a.pe", status: "advertencia", score: 0.9, source: "modelo", latencyMs: 120 }
  });
});

test("every transport error becomes a degraded outcome with the same reason", () => {
  ["timeout", "offline", "server", "cache_down"].forEach((error) => {
    assert.deepEqual(outcome.fromResult({ ok: false, error }), { kind: "degraded", reason: error });
  });
  assert.deepEqual(outcome.REASONS, ["offline", "timeout", "server", "cache_down"]);
});

test("unknown errors and malformed results degrade as a server failure", () => {
  const server = { kind: "degraded", reason: "server" };
  assert.deepEqual(outcome.fromResult({ ok: false, error: "weird" }), server);
  assert.deepEqual(outcome.fromResult({ ok: false, error: "invalid" }), server);
  assert.deepEqual(outcome.fromResult({ ok: true, status: "evaluando" }), server);
  assert.deepEqual(outcome.fromResult({ ok: true }), server);
  assert.deepEqual(outcome.fromResult(null), server);
  assert.deepEqual(outcome.fromResult(undefined), server);
  assert.deepEqual(outcome.fromResult("oops"), server);
});

test("pending outcomes carry a reason and read as the pending status", () => {
  assert.deepEqual(outcome.pending(), { kind: "pending", reason: "evaluating" });
  assert.equal(outcome.statusId(outcome.pending()), "pendiente");
});

test("the status to display comes from the existing catalog", () => {
  assert.equal(outcome.statusId(outcome.fromResult(GOOD)), "advertencia");
  assert.equal(outcome.statusId(outcome.degraded("offline")), "pendiente");
  assert.equal(outcome.statusId(null), "pendiente");
});

test("Evaluando shows only once the wait reaches the threshold (HU-25)", () => {
  assert.equal(outcome.shouldShowPending(0), false);
  assert.equal(outcome.shouldShowPending(outcome.PENDING_AFTER_MS - 1), false);
  assert.equal(outcome.shouldShowPending(outcome.PENDING_AFTER_MS), true);
});

test("protection is degraded only for degraded outcomes", () => {
  assert.equal(outcome.protectionLevel(outcome.fromResult(GOOD)), "active");
  assert.equal(outcome.protectionLevel(outcome.pending()), "active");
  assert.equal(outcome.protectionLevel(outcome.degraded("cache_down")), "degraded");
  assert.equal(outcome.protectionLevel(null), "degraded");
});

test("fail-open: only a real block verdict blocks navigation", () => {
  const block = outcome.fromResult(Object.assign({}, GOOD, { status: "bloqueo" }));
  assert.equal(outcome.blocksNavigation(block), true);
  assert.equal(outcome.blocksNavigation(outcome.fromResult(GOOD)), false);
  assert.equal(outcome.blocksNavigation(outcome.pending()), false);
  ["timeout", "offline", "server", "cache_down"].forEach((reason) => {
    assert.equal(outcome.blocksNavigation(outcome.degraded(reason)), false);
  });
  assert.equal(outcome.blocksNavigation(null), false);
});

test("degraded outcomes explain themselves in Spanish (HU-26)", () => {
  const cache = outcome.notice(outcome.degraded("cache_down"));
  assert.equal(cache.title, "Protección degradada");
  assert.match(cache.text, /caché/i);
  assert.match(outcome.notice(outcome.degraded("offline")).text, /conexión/i);
  assert.match(outcome.notice(outcome.degraded("timeout")).text, /tiempo/i);
  assert.match(outcome.notice(outcome.degraded("server")).text, /servidor/i);
  assert.equal(outcome.notice(outcome.fromResult(GOOD)), null);
  assert.equal(outcome.notice(outcome.pending()), null);
});

test("the site published for an outcome reuses the currentSite shape", () => {
  assert.deepEqual(outcome.siteOf(outcome.fromResult(GOOD), "https://www.a.pe/x", "t"), {
    domain: "a.pe",
    status: "advertencia",
    score: 0.9,
    source: "modelo",
    ts: "t"
  });
  assert.deepEqual(outcome.siteOf(outcome.degraded("offline"), "https://www.B.pe/x", "t"), {
    domain: "b.pe",
    status: "evaluando",
    score: null,
    source: null,
    ts: "t"
  });
  assert.equal(outcome.domainOf("not a url"), "not a url");
});

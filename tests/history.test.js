"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { history } = load("verdict/domain/verdict.js", "history/domain/history.js");

/* A backend record: the model verdict plus the policy in force when served. */
function record(id, domain, verdict, ts, policy) {
  return { id, domain, verdict, policy: policy || "advertencia", score: 0.5, source: "modelo", ts, latencyMs: 10 };
}

/* The list the backend would serve after one more visit: newest first. */
function visit(list, item) {
  return history.normalize([item].concat(list));
}

/* The entry the views get for a backend record. */
function entry(id, domain, verdict, ts, policy) {
  return history.toEntry(record(id, domain, verdict, ts, policy));
}

test("toEntry applies the policy of a backend record and yields the entry the views read", () => {
  assert.deepEqual(entry("h-1", "a.pe", "phishing", "2026-09-21T10:00", "bloqueo"), {
    id: "h-1",
    domain: "a.pe",
    status: "bloqueo",
    score: 0.5,
    source: "modelo",
    ts: "2026-09-21T10:00",
    latencyMs: 10
  });
  assert.equal(entry("h-2", "a.pe", "phishing", "t").status, "advertencia");
  assert.equal(entry("h-3", "a.pe", "legitima", "t", "bloqueo").status, "seguro");
});

test("toEntry has no entry for a record outside the contract", () => {
  assert.equal(history.toEntry({ id: "h-1", domain: "a.pe", status: "bloqueo", score: 0.9, ts: "t" }), null);
  assert.equal(history.toEntry({ id: "h-1", domain: "a.pe", verdict: "phishing", score: 0.9, ts: "t" }), null);
  assert.equal(history.toEntry({ id: "h-1", domain: "a.pe", verdict: "otro", policy: "bloqueo", ts: "t" }), null);
  assert.equal(history.toEntry(null), null);
});

test("normalize keeps the newest visit first", () => {
  const list = visit([record("h-1", "a.pe", "legitima", "2026-09-21T10:00")], record("h-2", "b.pe", "legitima", "2026-09-21T10:05"));
  assert.deepEqual(list.map((item) => item.id), ["h-2", "h-1"]);
});

test("normalize keeps one visit for the same domain and verdict within 60 seconds", () => {
  const first = [record("h-1", "a.pe", "legitima", "2026-09-21T10:00"), record("h-0", "z.pe", "legitima", "2026-09-21T09:00")];
  const list = visit(first, record("h-2", "a.pe", "legitima", "2026-09-21T10:01"));
  assert.deepEqual(list.map((item) => item.id), ["h-2", "h-0"]);
  const entries = [entry("h-1", "a.pe", "phishing", "2026-09-21T10:00"), entry("h-0", "z.pe", "legitima", "2026-09-21T09:00")];
  assert.deepEqual(visit(entries, entry("h-2", "a.pe", "phishing", "2026-09-21T10:01")).map((item) => item.id), ["h-2", "h-0"]);
});

test("normalize keeps visits with another verdict or outside the window", () => {
  const first = [record("h-1", "a.pe", "legitima", "2026-09-21T10:00")];
  assert.equal(visit(first, record("h-2", "a.pe", "phishing", "2026-09-21T10:00")).length, 2);
  assert.equal(visit(first, record("h-3", "a.pe", "legitima", "2026-09-21T10:02")).length, 2);
  const warned = [record("h-4", "b.pe", "phishing", "2026-09-21T10:00", "advertencia")];
  assert.equal(visit(warned, record("h-5", "b.pe", "phishing", "2026-09-21T10:00", "bloqueo")).length, 2);
  const entries = [entry("h-6", "c.pe", "phishing", "2026-09-21T10:00", "advertencia")];
  assert.equal(visit(entries, entry("h-7", "c.pe", "phishing", "2026-09-21T10:00", "bloqueo")).length, 2);
});

test("normalize caps the list at 200 entries and does not mutate the input", () => {
  const full = Array.from({ length: 200 }, (_, index) => record("h-" + index, "d" + index + ".pe", "legitima", "2026-09-01T10:00"));
  const list = visit(full, record("h-new", "new.pe", "legitima", "2026-09-21T10:00"));
  assert.equal(list.length, 200);
  assert.equal(list[0].id, "h-new");
  assert.equal(list[199].id, "h-198");
  assert.equal(full.length, 200);
});

test("filter and lookup", () => {
  const list = [entry("h-1", "a.pe", "legitima", "t"), entry("h-2", "b.pe", "phishing", "t", "bloqueo")];
  assert.deepEqual(history.filterIds(), ["todas", "seguro", "advertencia", "bloqueo"]);
  assert.equal(history.filter(list, "todas"), list);
  assert.deepEqual(history.filter(list, "bloqueo").map((item) => item.id), ["h-2"]);
  assert.deepEqual(history.filter(list, "advertencia"), []);
  assert.equal(history.findById(list, "h-2").domain, "b.pe");
  assert.equal(history.findById(list, "h-9"), null);
});

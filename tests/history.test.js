"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { history } = load("verdict/domain/verdict.js", "history/domain/history.js");

function record(id, domain, status, ts) {
  return history.createRecord({ domain, status, score: 0.5, source: "modelo", latencyMs: 10 }, id, ts);
}

test("createRecord fills defaults for source and latency", () => {
  assert.deepEqual(history.createRecord({ domain: "a.pe", status: "seguro", score: 0.1 }, "h-1", "2026-09-21T10:00"), {
    id: "h-1",
    domain: "a.pe",
    status: "seguro",
    score: 0.1,
    source: "modelo",
    ts: "2026-09-21T10:00",
    latencyMs: null
  });
});

test("append puts the newest visit first", () => {
  const list = history.append([record("h-1", "a.pe", "seguro", "2026-09-21T10:00")], record("h-2", "b.pe", "seguro", "2026-09-21T10:05"));
  assert.deepEqual(list.map((entry) => entry.id), ["h-2", "h-1"]);
});

test("append replaces the same domain and verdict within 60 seconds", () => {
  const first = [record("h-1", "a.pe", "seguro", "2026-09-21T10:00"), record("h-0", "z.pe", "seguro", "2026-09-21T09:00")];
  const list = history.append(first, record("h-2", "a.pe", "seguro", "2026-09-21T10:01"));
  assert.deepEqual(list.map((entry) => entry.id), ["h-2", "h-0"]);
});

test("append keeps visits with another verdict or outside the window", () => {
  const first = [record("h-1", "a.pe", "seguro", "2026-09-21T10:00")];
  assert.equal(history.append(first, record("h-2", "a.pe", "bloqueo", "2026-09-21T10:00")).length, 2);
  assert.equal(history.append(first, record("h-3", "a.pe", "seguro", "2026-09-21T10:02")).length, 2);
});

test("append caps the list at 200 entries and does not mutate the input", () => {
  const full = Array.from({ length: 200 }, (_, index) => record("h-" + index, "d" + index + ".pe", "seguro", "2026-09-01T10:00"));
  const list = history.append(full, record("h-new", "new.pe", "seguro", "2026-09-21T10:00"));
  assert.equal(list.length, history.CAPACITY);
  assert.equal(list[0].id, "h-new");
  assert.equal(list[199].id, "h-198");
  assert.equal(full.length, 200);
});

test("filter and lookup", () => {
  const list = [record("h-1", "a.pe", "seguro", "t"), record("h-2", "b.pe", "bloqueo", "t")];
  assert.deepEqual(history.filterIds(), ["todas", "seguro", "advertencia", "bloqueo"]);
  assert.equal(history.filter(list, "todas"), list);
  assert.deepEqual(history.filter(list, "bloqueo").map((entry) => entry.id), ["h-2"]);
  assert.deepEqual(history.filter(list, "advertencia"), []);
  assert.equal(history.findById(list, "h-2").domain, "b.pe");
  assert.equal(history.findById(list, "h-9"), null);
  assert.deepEqual(history.entriesOf({ ana: list }, "ana"), list);
  assert.deepEqual(history.entriesOf({}, "ana"), []);
  assert.deepEqual(history.entriesOf({ ana: list }, null), []);
});

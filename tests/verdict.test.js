"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { verdict } = load("verdict/domain/verdict.js");

test("catalog exposes the four statuses with their labels and tones", () => {
  assert.deepEqual(
    Object.keys(verdict.STATUSES).map((id) => [id, verdict.STATUSES[id].label, verdict.STATUSES[id].tone]),
    [
      ["seguro", "Seguro", "ok"],
      ["advertencia", "Advertencia", "warn"],
      ["bloqueo", "Bloqueado", "bad"],
      ["pendiente", "Evaluando…", "neutral"]
    ]
  );
  assert.deepEqual(verdict.VERDICTS, ["seguro", "advertencia", "bloqueo"]);
});

test("unknown statuses read as pending", () => {
  assert.equal(verdict.status("evaluando").id, "pendiente");
  assert.equal(verdict.status(undefined).title, "Evaluación pendiente");
  assert.equal(verdict.status("bloqueo").title, "Sitio bloqueado");
});

test("risk level depends on status and, for warnings, on the score", () => {
  assert.equal(verdict.riskLevel({ status: "bloqueo", score: 0.1 }), "Alto");
  assert.equal(verdict.riskLevel({ status: "advertencia", score: 0.85 }), "Alto");
  assert.equal(verdict.riskLevel({ status: "advertencia", score: 0.84 }), "Medio");
  assert.equal(verdict.riskLevel({ status: "seguro", score: 0.99 }), "Bajo");
  assert.equal(verdict.riskLevel({ status: "evaluando" }), "—");
});

test("source label and score percent", () => {
  assert.equal(verdict.sourceLabel("cache"), "Caché");
  assert.equal(verdict.sourceLabel("modelo"), "Modelo");
  assert.equal(verdict.sourceLabel(null), "Modelo");
  assert.equal(verdict.scorePercent(0.92), 92);
  assert.equal(verdict.scorePercent(1.7), 100);
  assert.equal(verdict.scorePercent(-1), 0);
  assert.equal(verdict.scorePercent(null), 0);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { verdict } = load("verdict/domain/verdict.js");

test("catalog exposes the three verdicts, the pending status and the not-evaluated status with their labels and tones", () => {
  assert.deepEqual(
    Object.keys(verdict.STATUSES).map((id) => [id, verdict.STATUSES[id].label, verdict.STATUSES[id].tone]),
    [
      ["seguro", "Seguro", "ok"],
      ["advertencia", "Advertencia", "warn"],
      ["bloqueo", "Bloqueado", "bad"],
      ["pendiente", "Evaluando…", "neutral"],
      ["sin_evaluar", "Sin evaluar", "neutral"]
    ]
  );
  assert.deepEqual(verdict.VERDICTS, ["seguro", "advertencia", "bloqueo"]);
});

test("unknown statuses read as pending", () => {
  assert.equal(verdict.status("evaluando").id, "pendiente");
  assert.equal(verdict.status(undefined).title, "Evaluación pendiente");
  assert.equal(verdict.status("bloqueo").title, "Sitio bloqueado");
});

test("the domain policy turns the two-class model verdict into a status", () => {
  assert.equal(verdict.applyPolicy("legitima", "advertencia"), "seguro");
  assert.equal(verdict.applyPolicy("legitima", "bloqueo"), "seguro");
  assert.equal(verdict.applyPolicy("phishing", "advertencia"), "advertencia");
  assert.equal(verdict.applyPolicy("phishing", "bloqueo"), "bloqueo");
});

test("a verdict or a policy outside the contract has no status", () => {
  assert.equal(verdict.applyPolicy("phishing", "seguro"), null);
  assert.equal(verdict.applyPolicy("phishing", undefined), null);
  assert.equal(verdict.applyPolicy("phishing", "Bloqueo"), null);
  assert.equal(verdict.applyPolicy("seguro", "advertencia"), null);
  assert.equal(verdict.applyPolicy("bloqueo", "bloqueo"), null);
  assert.equal(verdict.applyPolicy(undefined, "bloqueo"), null);
  assert.equal(verdict.applyPolicy(null, null), null);
});

test("the model classes have their own labels", () => {
  assert.equal(verdict.modelVerdict("phishing").label, "Phishing");
  assert.equal(verdict.modelVerdict("legitima").label, "Legítimo");
  assert.equal(verdict.modelVerdict("seguro"), null);
  assert.equal(verdict.modelVerdict(undefined), null);
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

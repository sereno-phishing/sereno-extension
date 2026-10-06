"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { protection, onboarding, demoScenarios } = load(
  "protection/domain/protection.js",
  "onboarding/domain/onboarding.js",
  "demo-store/domain/scenarios.js"
);

test("the model notice shows for signed-in users until dismissed", () => {
  assert.equal(protection.isNoticeVisible({ session: null }), false);
  assert.equal(protection.isNoticeVisible({ session: { username: "a" }, modelNoticeDismissed: false }), true);
  assert.equal(protection.isNoticeVisible({ session: { username: "a" }, modelNoticeDismissed: true }), false);
  assert.equal(protection.modelVersion({ session: { username: "a" } }), "1.3");
  assert.equal(protection.modelVersion({ session: null }), "1.2");
  assert.deepEqual(protection.evaluatingSite("x.pe", "t"), { domain: "x.pe", status: "evaluando", score: null, source: null, ts: "t" });
});

test("onboarding steps stay between 1 and 3", () => {
  assert.equal(onboarding.next(1), 2);
  assert.equal(onboarding.next(3), 3);
  assert.equal(onboarding.back(1), 1);
  assert.equal(onboarding.back(3), 2);
  assert.equal(onboarding.isDone({ onboardingDone: true }), true);
  assert.equal(onboarding.isDone({}), false);
});

test("demo scenarios map to the current site and to history visits", () => {
  const warning = demoScenarios.find("advertencia");
  assert.deepEqual(demoScenarios.siteOf(warning, "t"), {
    domain: "paypal-secure-login.com",
    status: "advertencia",
    score: 0.92,
    source: "modelo",
    ts: "t"
  });
  assert.equal(demoScenarios.visitOf(warning, "t").latencyMs, 186);
  assert.equal(demoScenarios.isRecorded(warning), true);
  assert.equal(demoScenarios.isRecorded(demoScenarios.find("pendiente")), false);
  assert.equal(demoScenarios.find("nope"), null);
  assert.equal(demoScenarios.find(demoScenarios.SAFE).status, "seguro");
});

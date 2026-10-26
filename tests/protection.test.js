"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { protection, onboarding, demoScenarios } = load(
  "protection/domain/protection.js",
  "onboarding/domain/onboarding.js",
  "demo-store/domain/scenarios.js"
);

test("the model notice is data driven: signed in, backend version differs from the last one seen", () => {
  const user = { username: "a" };
  assert.equal(protection.isNoticeVisible({ session: null, lastSeenModelVersion: "1.2" }, "1.3"), false);
  assert.equal(protection.isNoticeVisible({ session: user, lastSeenModelVersion: "1.2" }, "1.3"), true);
  assert.equal(protection.isNoticeVisible({ session: user, lastSeenModelVersion: "1.3" }, "1.3"), false);
  assert.equal(protection.isNoticeVisible({ session: user, lastSeenModelVersion: "1.2" }, null), false);
  assert.equal(protection.isNoticeVisible({ session: user, lastSeenModelVersion: "1.2" }), false);
  assert.equal(protection.isNoticeVisible({ session: user }, "1.3"), true);
});

test("a state saved with the old modelNoticeDismissed flag does not show the notice again", () => {
  const user = { username: "a" };
  assert.equal(protection.isNoticeVisible({ session: user, modelNoticeDismissed: true }, "1.3"), false);
  assert.equal(protection.isNoticeVisible({ session: user, modelNoticeDismissed: true, lastSeenModelVersion: "1.2" }, "1.3"), false);
  assert.equal(protection.isNoticeVisible({ session: user, modelNoticeDismissed: false, lastSeenModelVersion: "1.2" }, "1.3"), true);
});

test("the domain no longer derives a model version from the session", () => {
  assert.equal(protection.modelVersion, undefined);
  assert.equal(protection.MODEL_VERSION, undefined);
  assert.equal(protection.UPDATED_MODEL_VERSION, undefined);
});

test("evaluatingSite builds the placeholder", () => {
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

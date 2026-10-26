"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { protectionService, seed } = load(
  "platform/providers/errors.js", "platform/seed.js", "protection/domain/protection.js",
  "protection/application/protection-service.js"
);

test("dismissing the notice stores the backend version as the last one seen and clears the old flag", async () => {
  const patches = [];
  await protectionService.dismissModelNotice({ set: (patch) => { patches.push(patch); } }, "1.3");
  assert.deepEqual(patches, [{ lastSeenModelVersion: "1.3", modelNoticeDismissed: false }]);
});

test("dismissing without a known version changes nothing", async () => {
  const patches = [];
  await protectionService.dismissModelNotice({ set: (patch) => { patches.push(patch); } }, null);
  assert.deepEqual(patches, []);
});

test("the seed starts one version behind the constant the mock backend reports", () => {
  assert.equal(seed.defaultState.lastSeenModelVersion, "1.2");
  assert.equal(seed.modelVersion, "1.3");
  assert.equal("modelNoticeDismissed" in seed.defaultState, false);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { protectionService } = load(
  "platform/providers/errors.js", "protection/domain/protection.js",
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

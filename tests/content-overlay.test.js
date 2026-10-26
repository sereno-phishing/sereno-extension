"use strict";

/* Pure decisions of the in-page UI: which view an outcome gets, when an equal
   outcome is a no-op, when Esc may close, and where "Volver" goes. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load(
  "time/domain/time.js",
  "verdict/domain/verdict.js",
  "verdict/domain/outcome.js",
  "ui/atoms.js",
  "verdict/ui/verdict-ui.js",
  "demo-store/ui/verdict-modal.js",
  "verdict/ui/page-overlay.js"
);

const overlay = Sereno.pageOverlay;

function verdictOutcome(status, domain, score) {
  return { kind: "verdict", verdict: { domain: domain || "tienda.pe", status, score: score === undefined ? 0.9 : score, source: "modelo", latencyMs: 12 } };
}
const PENDING = { kind: "pending", reason: "evaluating" };
const DEGRADED = { kind: "degraded", reason: "offline" };

test("a warning verdict becomes a closable modal that can continue", () => {
  const plan = overlay.plan(verdictOutcome("advertencia"));
  assert.equal(plan.type, "modal");
  assert.equal(plan.closable, true);
  assert.equal(plan.canContinue, true);
  assert.equal(plan.key, "warning");
  assert.match(plan.html, /<dialog /);
  assert.match(plan.html, /Continuar bajo riesgo/);
});

test("a block verdict becomes a modal with no way to continue and no Esc", () => {
  const plan = overlay.plan(verdictOutcome("bloqueo"));
  assert.equal(plan.type, "modal");
  assert.equal(plan.closable, false);
  assert.equal(plan.canContinue, false);
  assert.doesNotMatch(plan.html, /data-action="continuar"|Continuar bajo riesgo/);
  assert.equal(overlay.escCloses(plan), false);
  assert.equal(overlay.escCloses(overlay.plan(verdictOutcome("advertencia"))), true);
});

test("a safe verdict has no UI", () => {
  assert.equal(overlay.plan(verdictOutcome("seguro")).type, "none");
});

test("pending is a polite status toast and degraded a dismissible notice", () => {
  const toast = overlay.plan(PENDING);
  assert.equal(toast.type, "toast");
  assert.match(toast.html, /role="status"/);
  assert.match(toast.html, /Evaluación pendiente/);

  const notice = overlay.plan(DEGRADED);
  assert.equal(notice.type, "notice");
  assert.match(notice.html, /Protección degradada/);
  assert.match(notice.html, /Sin conexión/);
  assert.match(notice.html, /data-action="dismiss"/);
  assert.equal(notice.canContinue, false);
});

test("unknown or malformed outcomes render nothing", () => {
  [null, undefined, {}, { kind: "other" }, { kind: "verdict" }, "x"].forEach((outcome) => {
    assert.equal(overlay.plan(outcome).type, "none");
  });
});

test("an equal outcome is kept, a different one replaces the UI", () => {
  const warning = verdictOutcome("advertencia");
  const first = overlay.decide({ id: null, dismissed: false }, warning, false);
  assert.equal(first.action, "render");
  assert.deepEqual(first.next, { id: first.plan.id, dismissed: false });

  const again = overlay.decide(first.next, JSON.parse(JSON.stringify(warning)), false);
  assert.equal(again.action, "keep");

  const other = overlay.decide(first.next, verdictOutcome("bloqueo", "otro.pe"), false);
  assert.equal(other.action, "render");
  assert.notEqual(other.next.id, first.next.id);
});

test("a dismissed modal is not reopened by the same outcome", () => {
  const warning = verdictOutcome("advertencia");
  const shown = overlay.decide({ id: null, dismissed: false }, warning, false).next;
  const dismissed = overlay.markDismissed(shown);
  assert.deepEqual(dismissed, { id: shown.id, dismissed: true });
  assert.equal(overlay.decide(dismissed, warning, false).action, "keep");
});

test("pending is replaced by the final outcome, and a safe verdict clears the UI", () => {
  const pending = overlay.decide({ id: null, dismissed: false }, PENDING, false);
  assert.equal(pending.action, "render");
  const safe = overlay.decide(pending.next, verdictOutcome("seguro"), false);
  assert.equal(safe.action, "clear");
  assert.deepEqual(safe.next, { id: null, dismissed: false });
  assert.equal(overlay.decide(safe.next, verdictOutcome("seguro"), false).action, "keep");
});

test("a warning the user already continued past is not shown again, a block always is", () => {
  const warning = overlay.decide({ id: null, dismissed: false }, verdictOutcome("advertencia"), true);
  assert.equal(warning.action, "keep");
  const block = overlay.decide({ id: null, dismissed: false }, verdictOutcome("bloqueo"), true);
  assert.equal(block.action, "render");
});

test("Volver goes back in history when there is a page to return to", () => {
  assert.equal(overlay.backTarget(3), "history");
  assert.equal(overlay.backTarget(1), "blank");
  assert.equal(overlay.backTarget(undefined), "blank");
});

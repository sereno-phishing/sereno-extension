/* Verdict · what the real page shows for an outcome. Classic script that
   registers Sereno.pageOverlay. Pure: it turns an outcome into a view plan
   (HTML plus the flags the container needs) and decides, from what is already
   on screen, whether to keep it, replace it or clear it. No DOM, no storage.

   plan.type
     modal   warning or block verdict, rendered by Sereno.verdictModal
     toast   pending evaluation (polite status, replaced by the final outcome)
     notice  degraded protection (non-blocking, dismissible, fail-open)
     none    safe verdict or anything unknown: no UI

   current state = { id, dismissed }: the identity of what is on screen and
   whether the user already closed it. An equal outcome never renders twice
   and never reopens something the user dismissed. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var outcomes = Sereno.verdictOutcome;
  var verdict = Sereno.verdict;
  var verdictModal = Sereno.verdictModal;

  var PENDING_COPY = {
    title: "Evaluación pendiente",
    text: "Aún no pudimos revisar este sitio. Evita ingresar datos de pago hasta que termine.",
    retry: "Reintentando automáticamente..."
  };

  var NONE = { type: "none", id: null, key: null, html: "", closable: false, canContinue: false, status: null };

  function idOf(outcome) {
    if (!outcome || typeof outcome !== "object") {
      return null;
    }
    if (outcome.kind === "verdict" && outcome.verdict) {
      var found = outcome.verdict;
      return ["verdict", found.domain, found.status, found.score].join(":");
    }
    if (outcome.kind === "pending") {
      return "pending";
    }
    if (outcome.kind === "degraded") {
      return "degraded:" + outcomes.degraded(outcome.reason).reason;
    }
    return null;
  }

  function toastHtml() {
    return (
      '<aside class="sereno-toast" role="status" aria-live="polite">\n' +
      ui.sizedIcon("toast-pending-32", "sereno-toast-icon", 32) + "\n" +
      '<div class="sereno-toast-body">\n' +
      '<p class="sereno-toast-title">' + ui.esc(PENDING_COPY.title) + "</p>\n" +
      '<p class="sereno-toast-text">' + ui.esc(PENDING_COPY.text) + "</p>\n" +
      '<p class="sereno-toast-retry">' + ui.esc(PENDING_COPY.retry) + "</p>\n" +
      "</div>\n</aside>"
    );
  }

  function noticeHtml(notice) {
    return (
      '<aside class="sereno-notice" role="status" aria-live="polite">\n' +
      ui.sizedIcon("alert-warn-14", "sereno-notice-icon", 16) + "\n" +
      '<div class="sereno-notice-body">\n' +
      '<p class="sereno-notice-title">' + ui.esc(notice.title) + "</p>\n" +
      '<p class="sereno-notice-text">' + ui.esc(notice.text) + "</p>\n" +
      "</div>\n" +
      '<button type="button" class="sereno-notice-close" data-action="dismiss">Entendido</button>\n' +
      "</aside>"
    );
  }

  function plan(outcome) {
    var id = idOf(outcome);
    if (id === null) {
      return NONE;
    }
    if (outcome.kind === "pending") {
      return { type: "toast", id: id, key: "pending", html: toastHtml(), closable: false, canContinue: false, status: "pendiente" };
    }
    if (outcome.kind === "degraded") {
      return { type: "notice", id: id, key: "degraded", html: noticeHtml(outcomes.notice(outcome)), closable: true, canContinue: false, status: null };
    }
    var found = outcome.verdict;
    var key = verdictModal.keyOf(found.status);
    if (!key) {
      return NONE;
    }
    return {
      type: "modal",
      id: id,
      key: key,
      html: verdictModal.renderDialog(found, { openDetail: true }),
      closable: verdictModal.isClosable(found.status),
      canContinue: verdictModal.canContinue(found.status),
      status: found.status,
      percent: verdict.scorePercent(found.score)
    };
  }

  /* Esc closes only a modal that allows it; the block modal never does. */
  function escCloses(viewPlan) {
    return !!viewPlan && viewPlan.type === "modal" && viewPlan.closable === true;
  }

  /* -> { action: "keep" | "render" | "clear", plan, next }
     acknowledged: the user already continued past this warning on this origin
     (only a warning can be; a block is always shown). */
  function decide(current, outcome, acknowledged) {
    var state = current || { id: null, dismissed: false };
    var wanted = plan(outcome);
    if (acknowledged && wanted.type === "modal" && wanted.canContinue) {
      wanted = NONE;
    }
    if (wanted.type === "none") {
      return {
        action: state.id === null ? "keep" : "clear",
        plan: NONE,
        next: { id: null, dismissed: false }
      };
    }
    if (wanted.id === state.id) {
      return { action: "keep", plan: wanted, next: state };
    }
    return { action: "render", plan: wanted, next: { id: wanted.id, dismissed: false } };
  }

  function markDismissed(current) {
    return { id: current ? current.id : null, dismissed: true };
  }

  /* "Volver": back in history when there is a page to return to, otherwise a
     blank page, so a page opened directly in a tab can still be left. */
  function backTarget(historyLength) {
    return Number(historyLength) > 1 ? "history" : "blank";
  }

  Sereno.pageOverlay = {
    plan: plan,
    decide: decide,
    markDismissed: markDismissed,
    escCloses: escCloses,
    backTarget: backTarget
  };
})(globalThis.Sereno = globalThis.Sereno || {});

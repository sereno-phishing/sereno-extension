/* Onboarding: the three-step first-run walkthrough. Classic script that
   registers Sereno.onboarding. Pure. */

(function (Sereno) {
  "use strict";

  var STEP_COUNT = 3;

  function next(step) {
    return Math.min(STEP_COUNT, step + 1);
  }

  function back(step) {
    return Math.max(1, step - 1);
  }

  function isDone(state) {
    return !!state.onboardingDone;
  }

  Sereno.onboarding = {
    STEP_COUNT: STEP_COUNT,
    next: next,
    back: back,
    isDone: isDone
  };
})(globalThis.Sereno = globalThis.Sereno || {});

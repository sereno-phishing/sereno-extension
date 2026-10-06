/* Onboarding · use cases. Classic script that registers Sereno.onboardingService. */

(function (Sereno) {
  "use strict";

  function complete(store) {
    return store.set({ onboardingDone: true });
  }

  Sereno.onboardingService = {
    complete: complete
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Verdict · use case. Classic script that registers Sereno.verdictService.
   evaluate(services, url, opts) asks the verdict port for a verdict and
   always resolves a normalized outcome (see verdict/domain/outcome.js); it
   never throws and never blocks on failure (fail-open, documented there).
     services  the composition root (Sereno.services) or any object with
               verdict.evaluate(url); passed in so tests and callers decide
     opts      timeoutMs      own deadline, longer than the adapter's (default 6000)
               pendingAfterMs wait before onPending fires (default PENDING_AFTER_MS)
               onPending(o)   called once with the pending outcome if the wait
                              is noticeable ("Evaluando…", HU-25)
               store, now     optional: publish currentSite and protectionLevel
                              to the state store; nothing is persisted without it */

(function (Sereno) {
  "use strict";

  var outcomes = Sereno.verdictOutcome;
  var DEFAULT_TIMEOUT_MS = 6000;

  async function ask(services, url) {
    return services.verdict.evaluate(url);
  }

  /* Resolves the provider result, or a timeout failure once the deadline passes. */
  async function withDeadline(promise, timeoutMs) {
    var timer = null;
    var deadline = new Promise(function (resolve) {
      timer = setTimeout(function () {
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  function notifyPending(onPending) {
    try {
      onPending(outcomes.pending());
    } catch (error) {
      /* a broken UI callback must not break the evaluation */
    }
  }

  async function publish(store, outcome, url, now) {
    try {
      var stamp = Sereno.time.stamp(now());
      await store.set({
        currentSite: outcomes.siteOf(outcome, url, stamp),
        protectionLevel: outcomes.protectionLevel(outcome)
      });
    } catch (error) {
      /* the outcome is still valid when the store fails */
    }
  }

  async function evaluate(services, url, opts) {
    var settings = opts || {};
    var timeoutMs = settings.timeoutMs > 0 ? settings.timeoutMs : DEFAULT_TIMEOUT_MS;
    var pendingAfterMs = settings.pendingAfterMs >= 0 ? settings.pendingAfterMs : outcomes.PENDING_AFTER_MS;
    var now =
      settings.now ||
      function () {
        return new Date();
      };
    var pendingTimer = null;
    var outcome;
    try {
      if (typeof settings.onPending === "function") {
        pendingTimer = setTimeout(function () {
          notifyPending(settings.onPending);
        }, pendingAfterMs);
      }
      outcome = outcomes.fromResult(await withDeadline(ask(services, url), timeoutMs));
    } catch (error) {
      outcome = outcomes.degraded("server");
    } finally {
      clearTimeout(pendingTimer);
    }
    if (settings.store) {
      await publish(settings.store, outcome, url, now);
    }
    return outcome;
  }

  Sereno.verdictService = { evaluate: evaluate };
})(globalThis.Sereno = globalThis.Sereno || {});

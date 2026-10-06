/* Sereno demo store controller: drives the simulated e-commerce page, the
   in-page scenario overlays (safe tooltip, warning, block, pending) and the
   per-tab action badge. The currentSite written here is the same value the
   popup reads, so both surfaces stay in sync.
   Classic script, no inline handlers: all interaction flows through data-*
   attributes. Every chrome.* call is optional-chained so the Node harness
   works without an extension runtime. */

(function () {
  "use strict";

  var time = Sereno.time;
  var scenarios = Sereno.demoScenarios;
  var store = Sereno.stateStore.open();

  var EVAL_MS = 700;
  var TOOLTIP_MS = 3000;
  var TOAST_MS = 6000;

  /* Toolbar badge per verdict status. */
  var BADGES = {
    seguro: { text: "✓", color: "#16A34A" },
    advertencia: { text: "!", color: "#D97706" },
    bloqueo: { text: "✕", color: "#DC2626" },
    pendiente: { text: "…", color: "#6B7280" }
  };

  /* Latest run wins: a click that arrives while another evaluation is in
     flight supersedes it without writing a stale verdict. */
  var runToken = 0;
  var tooltipTimer = null;
  var toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function nowStamp() {
    return time.stamp(new Date());
  }

  function applyBadge(scenario) {
    return Sereno.browser.setTabBadge(BADGES[scenario.status]);
  }

  /* ---------------- overlays ---------------- */

  function setStamp(id) {
    var node = byId(id);
    if (node) {
      node.textContent = time.formatDateTime(nowStamp());
    }
  }

  function setDetail(which, open) {
    var detail = byId(which + "-details");
    var toggle = document.querySelector('[data-detail="' + which + '"]');
    if (detail) {
      detail.hidden = !open;
    }
    if (toggle) {
      toggle.textContent = open ? "Ocultar detalle" : "Ver detalle";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function showFeedback(name) {
    if (name === "seguro") {
      var tooltip = byId("safe-tooltip");
      if (tooltip) {
        tooltip.classList.add("is-visible");
      }
      if (tooltipTimer) {
        window.clearTimeout(tooltipTimer);
      }
      tooltipTimer = window.setTimeout(function () {
        var node = byId("safe-tooltip");
        if (node) {
          node.classList.remove("is-visible");
        }
        tooltipTimer = null;
      }, TOOLTIP_MS + 120);
      return;
    }

    if (name === "advertencia") {
      setStamp("warning-stamp");
      setDetail("warning", false);
      var warning = byId("warning-overlay");
      if (warning) {
        warning.hidden = false;
      }
      return;
    }

    if (name === "bloqueo") {
      setStamp("block-stamp");
      setDetail("block", false);
      var block = byId("block-overlay");
      if (block) {
        block.hidden = false;
      }
      return;
    }

    var toast = byId("pending-toast");
    if (toast) {
      toast.classList.add("is-visible");
    }
    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(function () {
      var node = byId("pending-toast");
      if (node) {
        node.classList.remove("is-visible");
      }
      toastTimer = null;
    }, TOAST_MS + 150);
  }

  function closeModals() {
    var warning = byId("warning-overlay");
    var block = byId("block-overlay");
    if (warning) {
      warning.hidden = true;
    }
    if (block) {
      block.hidden = true;
    }
  }

  function hideFeedback() {
    if (tooltipTimer) {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    var tooltip = byId("safe-tooltip");
    var toast = byId("pending-toast");
    if (tooltip) {
      tooltip.classList.remove("is-visible");
    }
    if (toast) {
      toast.classList.remove("is-visible");
    }
    closeModals();
  }

  /* ---------------- scenario runner ---------------- */

  function runScenario(name) {
    var scenario = scenarios.find(name);
    if (!scenario) {
      return Promise.resolve(false);
    }
    var token = runToken + 1;
    runToken = token;
    hideFeedback();

    return Sereno.protectionService.showSite(store, Sereno.protection.evaluatingSite(scenario.domain, nowStamp()))
      .then(function () {
        return wait(EVAL_MS);
      })
      .then(function () {
        if (token !== runToken) {
          return false;
        }
        return Sereno.protectionService.showSite(store, scenarios.siteOf(scenario, nowStamp()))
          .then(function () {
            return applyBadge(scenario);
          })
          .then(function () {
            showFeedback(name);
            if (!scenarios.isRecorded(scenario)) {
              return undefined;
            }
            return Sereno.historyService.recordVisit(store, scenarios.visitOf(scenario, nowStamp()), new Date());
          })
          .then(function () {
            return true;
          });
      })
      .catch(function () {
        /* prototype: a storage hiccup must not break the demo */
        return false;
      });
  }

  /* Volver / Volver a un sitio seguro: close the verdict and reset the
     simulated navigation to the safe scenario. */
  function resetToSafe() {
    runToken += 1;
    hideFeedback();
    var scenario = scenarios.find(scenarios.SAFE);
    return Sereno.protectionService.showSite(store, scenarios.siteOf(scenario, nowStamp()))
      .then(function () {
        return applyBadge(scenario);
      })
      .catch(function () {
        /* prototype: never block the reset */
      });
  }

  /* ---------------- events ---------------- */

  function onClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") {
      return;
    }

    var scenarioButton = target.closest("[data-scenario]");
    if (scenarioButton) {
      runScenario(scenarioButton.getAttribute("data-scenario"));
      return;
    }

    var actionButton = target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    var action = actionButton.getAttribute("data-action");
    if (action === "volver") {
      resetToSafe();
      return;
    }
    if (action === "continuar") {
      closeModals();
      return;
    }
    if (action === "toggle-detail") {
      var which = actionButton.getAttribute("data-detail");
      var detail = byId(which + "-details");
      if (detail) {
        setDetail(which, detail.hidden);
      }
    }
  }

  function init() {
    document.addEventListener("click", onClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

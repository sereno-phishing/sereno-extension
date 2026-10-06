/* Demo store · container: runs the simulated navigation scenarios against the
   shared store, shows the in-page feedback (safe tooltip, verdict modals,
   pending toast) and paints the per-tab toolbar badge. The current site and
   the history it writes are what the popup reads, so both stay in sync.
   Classic script. No inline handlers: interaction flows through data-*. */

(function () {
  "use strict";

  var time = Sereno.time;
  var scenarios = Sereno.demoScenarios;
  var verdictModal = Sereno.verdictModal;
  var store = Sereno.stateStore.open();

  var EVAL_MS = 700;
  var TOOLTIP_MS = 3000;
  var TOAST_MS = 6000;

  /* Latest run wins: a click that arrives while another evaluation is in
     flight supersedes it without writing a stale verdict. */
  var runToken = 0;

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

  /* ---------------- transient feedback ---------------- */

  /* Toggles .is-visible on an element and hides it again after ms. */
  function transient(id, ms) {
    var timer = null;
    function hide() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      var node = byId(id);
      if (node) {
        node.classList.remove("is-visible");
      }
    }
    return {
      show: function () {
        var node = byId(id);
        if (node) {
          node.classList.add("is-visible");
        }
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = window.setTimeout(hide, ms);
      },
      hide: hide
    };
  }

  var tooltip = transient("safe-tooltip", TOOLTIP_MS + 120);
  var toast = transient("pending-toast", TOAST_MS + 150);

  /* ---------------- verdict modals ---------------- */

  var MODAL_KEYS = Object.keys(scenarios.SCENARIOS)
    .map(function (name) {
      return verdictModal.keyOf(scenarios.SCENARIOS[name].status);
    })
    .filter(Boolean);

  /* Replaces each [data-verdict-modal] placeholder with its rendered modal. */
  function mountModals() {
    Array.prototype.slice.call(document.querySelectorAll("[data-verdict-modal]")).forEach(function (placeholder) {
      placeholder.outerHTML = verdictModal.render(scenarios.find(placeholder.getAttribute("data-verdict-modal")));
    });
  }

  function setDetail(key, open) {
    var detail = byId(key + "-details");
    var toggle = document.querySelector('[data-detail="' + key + '"]');
    if (detail) {
      detail.hidden = !open;
    }
    if (toggle) {
      toggle.textContent = open ? "Ocultar detalle" : "Ver detalle";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function openModal(key) {
    var stamp = byId(key + "-stamp");
    if (stamp) {
      stamp.textContent = time.formatDateTime(nowStamp());
    }
    setDetail(key, false);
    var overlay = byId(key + "-overlay");
    if (overlay) {
      overlay.hidden = false;
    }
  }

  function closeModals() {
    MODAL_KEYS.forEach(function (key) {
      var overlay = byId(key + "-overlay");
      if (overlay) {
        overlay.hidden = true;
      }
    });
  }

  function showFeedback(scenario) {
    var modalKey = verdictModal.keyOf(scenario.status);
    if (scenario.status === "seguro") {
      tooltip.show();
    } else if (modalKey) {
      openModal(modalKey);
    } else {
      toast.show();
    }
  }

  function hideFeedback() {
    tooltip.hide();
    toast.hide();
    closeModals();
  }

  function applyBadge(scenario) {
    return Sereno.browser.setTabBadge(Sereno.verdictUi.toolbarBadge(scenario.status));
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
            showFeedback(scenario);
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

  /* Command table: data-action name -> handler(target). */
  var ACTIONS = {
    volver: resetToSafe,
    continuar: closeModals,
    "toggle-detail": function (target) {
      var key = target.getAttribute("data-detail");
      var detail = byId(key + "-details");
      if (detail) {
        setDetail(key, detail.hidden);
      }
    }
  };

  function init() {
    mountModals();
    Sereno.ui.delegateClicks(document, "data-scenario", runScenario);
    Sereno.ui.delegateActions(document, ACTIONS);
  }

  Sereno.ui.onReady(init);
})();

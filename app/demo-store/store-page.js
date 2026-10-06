/* Sereno demo store controller: drives the simulated e-commerce page, the
   in-page scenario overlays (safe tooltip, warning, block, pending) and the
   per-tab action badge. The currentSite written here is the same value the
   popup reads, so both surfaces stay in sync.
   Classic script, no inline handlers: all interaction flows through data-*
   attributes. Every chrome.* call is optional-chained so the Node harness
   works without an extension runtime. */

(function () {
  "use strict";

  var Store = window.SerenoStore;

  var EVAL_MS = 700;
  var TOOLTIP_MS = 3000;
  var TOAST_MS = 6000;

  /* Scenario metadata: domain, verdict, score, source and badge appearance
     mirror the mockups and the seed history. */
  var SCENARIOS = {
    seguro: {
      domain: "tienda-servicios.pe",
      status: "seguro",
      score: 0.04,
      source: "modelo",
      latencyMs: 142,
      badge: "✓",
      badgeColor: "#16A34A"
    },
    advertencia: {
      domain: "paypal-secure-login.com",
      status: "advertencia",
      score: 0.92,
      source: "modelo",
      latencyMs: 186,
      badge: "!",
      badgeColor: "#D97706"
    },
    bloqueo: {
      domain: "pago-servicios-linea.net",
      status: "bloqueo",
      score: 0.97,
      source: "cache",
      latencyMs: 38,
      badge: "✕",
      badgeColor: "#DC2626"
    },
    pendiente: {
      domain: "reservas-hotel-lima.com",
      status: "pendiente",
      score: null,
      source: null,
      latencyMs: null,
      badge: "…",
      badgeColor: "#6B7280"
    }
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

  function buildSite(meta) {
    return {
      domain: meta.domain,
      status: meta.status,
      score: meta.score,
      source: meta.source,
      ts: Store.todayStamp()
    };
  }

  /* ---------------- badge bridge ---------------- */

  function chromeRef() {
    return typeof chrome !== "undefined" ? chrome : undefined;
  }

  async function applyBadge(meta) {
    var ext = chromeRef();
    try {
      var tab = await ext?.tabs?.getCurrent?.();
      var tabId = tab && tab.id;
      if (tabId === undefined || tabId === null) {
        return;
      }
      ext?.action?.setBadgeText?.({ tabId: tabId, text: meta.badge });
      ext?.action?.setBadgeBackgroundColor?.({ tabId: tabId, color: meta.badgeColor });
    } catch (error) {
      /* prototype: the badge is cosmetic and never blocks the demo flow */
    }
  }

  /* ---------------- overlays ---------------- */

  function setStamp(id) {
    var node = byId(id);
    if (node) {
      node.textContent = Store.formatDate(Store.todayStamp());
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

  /* ---------------- history ---------------- */

  function logHistory(meta) {
    return Store.get().then(function (state) {
      var session = state ? state.session : null;
      if (!session || !session.username) {
        return undefined;
      }
      return Store.appendHistory(session.username, {
        domain: meta.domain,
        status: meta.status,
        score: meta.score,
        source: meta.source,
        latencyMs: meta.latencyMs,
        ts: Store.todayStamp()
      });
    });
  }

  /* ---------------- scenario runner ---------------- */

  function runScenario(name) {
    var meta = SCENARIOS[name];
    if (!meta) {
      return Promise.resolve(false);
    }
    var token = runToken + 1;
    runToken = token;
    hideFeedback();

    return Store.set({
      currentSite: { domain: meta.domain, status: "evaluando", score: null, source: null, ts: Store.todayStamp() }
    })
      .then(function () {
        return wait(EVAL_MS);
      })
      .then(function () {
        if (token !== runToken) {
          return false;
        }
        return Store.set({ currentSite: buildSite(meta) })
          .then(function () {
            return applyBadge(meta);
          })
          .then(function () {
            showFeedback(name);
            if (meta.status === "pendiente") {
              return undefined;
            }
            return logHistory(meta);
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
    var meta = SCENARIOS.seguro;
    return Store.set({ currentSite: buildSite(meta) })
      .then(function () {
        return applyBadge(meta);
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

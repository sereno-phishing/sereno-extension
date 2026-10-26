/* Content script · container that shows the verdict UI on a real page.
   Classic script that registers Sereno.contentScript and, inside a browser
   page, starts itself. It receives { type: "sereno:outcome", outcome } from the
   service worker and renders it with the same views the demo store uses; it
   never reaches a backend and does not know which provider produced the
   verdict. The user's choices go back to the worker as messages:
     { type: "sereno:get-outcome" }          current outcome (page opened first)
     { type: "sereno:continue", url }        continue past a warning (never a block)
     { type: "sereno:detail", url }          open the Sereno detail page

   Isolation: everything is drawn inside a closed shadow root appended to
   <html>, so page CSS cannot restyle the UI and the UI cannot leak into the
   page. The page is never asked for an extension URL: the styles are a
   constructable stylesheet adopted by the shadow root and the icons are inline
   svg, both taken from Sereno.contentAssets (content-assets.generated.js, built
   by tools/build-content-assets.js). A warning or block is a
   native <dialog> opened with showModal(): the page becomes inert, focus is
   trapped and returned on close. Esc closes a warning; a block ignores it.

   Idempotent: the worker repeats the final outcome when the page finishes
   loading, so an equal outcome never renders twice and never reopens
   something the user closed. A new outcome replaces what is on screen. */

(function (Sereno) {
  "use strict";

  var MESSAGE_TYPE = "sereno:outcome";

  /* env = { document, browser, location, history, now, CSSStyleSheet }
     browser: onMessage(handler), sendMessage(message)
     CSSStyleSheet: the constructor for constructable stylesheets, when there is one. */
  function create(env) {
    var overlay = Sereno.pageOverlay;
    var doc = env.document;
    var browser = env.browser;

    var host = null;
    var surface = null;
    var state = { id: null, dismissed: false };
    var current = null;
    var activeDialog = null;
    var returnFocus = null;
    var savedOverflow = null;

    var assets = Sereno.contentAssets;
    Sereno.ui.setInlineAssets(assets.icons);

    /* ---------------- shadow host ---------------- */

    /* A constructable stylesheet is not subject to the page's style-src policy.
       Without support (or without adoptedStyleSheets on the shadow root) the
       same text goes into a <style> element, which a strict style-src may block:
       a degraded fallback, not the normal path. */
    function applyStyles(shadow) {
      var Sheet = env.CSSStyleSheet;
      if (typeof Sheet === "function" && "adoptedStyleSheets" in shadow) {
        var sheet = new Sheet();
        sheet.replaceSync(assets.css);
        shadow.adoptedStyleSheets = [sheet];
        return;
      }
      var style = doc.createElement("style");
      style.textContent = assets.css;
      shadow.appendChild(style);
    }

    function ensureSurface() {
      if (surface) {
        return surface;
      }
      host = doc.createElement("div");
      host.setAttribute("data-sereno", "");
      var shadow = host.attachShadow({ mode: "closed" });
      applyStyles(shadow);
      surface = doc.createElement("div");
      surface.setAttribute("class", "sereno-surface");
      surface.addEventListener("click", onClick);
      shadow.appendChild(surface);
      doc.documentElement.appendChild(host);
      return surface;
    }

    function lockScroll() {
      if (savedOverflow === null) {
        savedOverflow = doc.documentElement.style.overflow || "";
        doc.documentElement.style.overflow = "hidden";
      }
    }

    function unlockScroll() {
      if (savedOverflow !== null) {
        doc.documentElement.style.overflow = savedOverflow;
        savedOverflow = null;
      }
    }

    /* Removes whatever is on screen. The dialog is detached from the active
       slot first, so its (asynchronous) close event is not taken for the user
       dismissing something. */
    function clearView() {
      var dialog = activeDialog;
      activeDialog = null;
      if (dialog && dialog.open && typeof dialog.close === "function") {
        dialog.close();
      }
      unlockScroll();
      if (surface) {
        surface.innerHTML = "";
      }
      current = null;
    }

    /* ---------------- rendering ---------------- */

    function openModal(viewPlan) {
      var dialog = surface.querySelector("dialog");
      if (!dialog) {
        return;
      }
      var stamp = surface.querySelector("#" + viewPlan.key + "-stamp");
      if (stamp) {
        stamp.textContent = Sereno.time.formatDateTime(Sereno.time.stamp(env.now()));
      }
      var fill = surface.querySelector(".verdict-score-fill");
      if (fill) {
        fill.style.width = viewPlan.percent + "%";
      }
      /* Esc: a warning may close, a block cancels the request. */
      dialog.addEventListener("cancel", function (event) {
        if (!overlay.escCloses(viewPlan)) {
          event.preventDefault();
        }
      });
      dialog.addEventListener("close", function () {
        if (activeDialog !== dialog) {
          return;
        }
        activeDialog = null;
        state = overlay.markDismissed(state);
        unlockScroll();
        restoreFocus();
      });
      returnFocus = doc.activeElement || null;
      activeDialog = dialog;
      lockScroll();
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }

    function restoreFocus() {
      var target = returnFocus;
      returnFocus = null;
      if (target && typeof target.focus === "function") {
        target.focus();
      }
    }

    function render(viewPlan) {
      clearView();
      ensureSurface();
      surface.innerHTML = viewPlan.html;
      current = viewPlan;
      if (viewPlan.type === "modal") {
        openModal(viewPlan);
      }
    }

    function show(outcome, acknowledged) {
      var decision = overlay.decide(state, outcome, acknowledged === true);
      state = decision.next;
      if (decision.action === "render") {
        render(decision.plan);
      } else if (decision.action === "clear") {
        clearView();
      }
    }

    /* ---------------- user actions ---------------- */

    /* The port already turns a lost worker into null; this keeps a throwing
       port from breaking the page too. */
    async function ask(message) {
      try {
        return await browser.sendMessage(message);
      } catch (error) {
        return null;
      }
    }

    function toWorker(type) {
      return ask({ type: type, url: env.location.href });
    }

    function dismissCurrent() {
      state = overlay.markDismissed(state);
      var returning = activeDialog !== null;
      clearView();
      if (returning) {
        restoreFocus();
      }
    }

    function goBack() {
      if (overlay.backTarget(env.history.length) === "history") {
        env.history.back();
      } else {
        env.location.replace("about:blank");
      }
    }

    function toggleDetail(element) {
      var key = element.getAttribute("data-detail");
      var details = surface.querySelector("#" + key + "-details");
      if (!details) {
        return;
      }
      var open = details.hidden === true;
      details.hidden = !open;
      element.textContent = open ? "Ocultar detalle" : "Ver detalle";
      element.setAttribute("aria-expanded", open ? "true" : "false");
    }

    var ACTIONS = {
      volver: goBack,
      continuar: async function () {
        if (!current || !current.canContinue) {
          return;
        }
        await toWorker("sereno:continue");
        dismissCurrent();
      },
      dismiss: dismissCurrent,
      "toggle-detail": toggleDetail,
      "open-detail": function () {
        return toWorker("sereno:detail");
      }
    };

    function onClick(event) {
      var target = event && event.target;
      var element = target && typeof target.closest === "function" ? target.closest("[data-action]") : null;
      var name = element ? element.getAttribute("data-action") : null;
      if (name && Object.prototype.hasOwnProperty.call(ACTIONS, name)) {
        ACTIONS[name](element);
      }
    }

    /* ---------------- messages ---------------- */

    async function handleMessage(message) {
      if (message && message.type === MESSAGE_TYPE) {
        show(message.outcome, message.acknowledged === true);
      }
    }

    async function requestCurrent() {
      var reply = await ask({ type: "sereno:get-outcome" });
      if (reply && reply.ok === true && reply.outcome) {
        show(reply.outcome, reply.acknowledged === true);
      }
    }

    /* Registers the listener synchronously (before any await), then asks the
       worker for the outcome of a page that finished loading first. */
    async function start() {
      browser.onMessage(handleMessage);
      await requestCurrent();
    }

    return { start: start, handleMessage: handleMessage };
  }

  Sereno.contentScript = { MESSAGE_TYPE: MESSAGE_TYPE, create: create };

  if (typeof document !== "undefined" && document.documentElement) {
    Sereno.contentScript.create({
      document: document,
      browser: Sereno.browser,
      location: location,
      history: history,
      now: function () {
        return new Date();
      },
      CSSStyleSheet: typeof CSSStyleSheet === "function" ? CSSStyleSheet : undefined
    }).start();
  }
})(globalThis.Sereno = globalThis.Sereno || {});

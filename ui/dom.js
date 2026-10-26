/* Design system · DOM wiring shared by the page containers: run once the
   document is ready, and delegate clicks on elements that carry a data-*
   attribute (MV3 CSP forbids inline handlers). Classic script that extends
   Sereno.ui. */

(function (Sereno) {
  "use strict";

  function onReady(init) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  /* Calls handle(value, element) for clicks inside root on the closest
     element carrying the attribute. */
  function delegateClicks(root, attribute, handle) {
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }
      var element = target.closest("[" + attribute + "]");
      if (!element || !root.contains(element)) {
        return;
      }
      handle(element.getAttribute(attribute), element);
    });
  }

  /* Command table dispatch: data-action="name" runs actions[name](element). */
  function delegateActions(root, actions) {
    delegateClicks(root, "data-action", function (name, element) {
      if (Object.prototype.hasOwnProperty.call(actions, name)) {
        actions[name](element);
      }
    });
  }

  /* Index to move to for a roving-focus key (arrows along the orientation, Home,
     End; wraps around), or -1 when the key does nothing. */
  function rovingIndex(count, current, key, orientation) {
    if (!count) {
      return -1;
    }
    if (key === "Home") {
      return 0;
    }
    if (key === "End") {
      return count - 1;
    }
    var vertical = orientation === "vertical";
    if (key === (vertical ? "ArrowDown" : "ArrowRight")) {
      return (current + 1) % count;
    }
    if (key === (vertical ? "ArrowUp" : "ArrowLeft")) {
      return (current - 1 + count) % count;
    }
    return -1;
  }

  var FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  /* Keeps Tab and Shift+Tab inside container (a modal dialog that is not a
     native <dialog>). Only the ends wrap; focus anywhere else moves normally. */
  function trapTab(event, container, doc) {
    if (event.key !== "Tab" || !container) {
      return false;
    }
    var items = Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE)).filter(function (item) {
      return !item.disabled;
    });
    if (!items.length) {
      event.preventDefault();
      return true;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var active = (doc || document).activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
    return true;
  }

  var FOCUS_ATTRIBUTES = ["id", "name", "data-action", "data-tab", "data-filter", "data-id", "data-value", "data-section", "data-domain", "data-policy"];

  /* A container that redraws itself with innerHTML loses the focused element.
     Call this before the redraw and the returned function after it: it focuses
     the new element that carries the same tag and identifying attributes. */
  function captureFocus(root, doc) {
    var active = (doc || document).activeElement;
    var none = function () {};
    if (!active || !root.contains(active) || typeof active.getAttribute !== "function") {
      return none;
    }
    var selector = String(active.tagName).toLowerCase();
    var specific = false;
    FOCUS_ATTRIBUTES.forEach(function (name) {
      var value = active.getAttribute(name);
      if (value) {
        specific = true;
        selector += "[" + name + '="' + String(value).replace(/(["\\])/g, "\\$1") + '"]';
      }
    });
    if (!specific) {
      return none;
    }
    return function () {
      var node = root.querySelector(selector);
      if (node && typeof node.focus === "function") {
        node.focus();
      }
    };
  }

  Sereno.ui.rovingIndex = rovingIndex;
  Sereno.ui.trapTab = trapTab;
  Sereno.ui.captureFocus = captureFocus;
  Sereno.ui.onReady = onReady;
  Sereno.ui.delegateClicks = delegateClicks;
  Sereno.ui.delegateActions = delegateActions;
})(globalThis.Sereno = globalThis.Sereno || {});

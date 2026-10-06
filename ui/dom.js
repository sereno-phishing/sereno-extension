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

  Sereno.ui.onReady = onReady;
  Sereno.ui.delegateClicks = delegateClicks;
  Sereno.ui.delegateActions = delegateActions;
})(globalThis.Sereno = globalThis.Sereno || {});

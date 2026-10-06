/* Platform · browser adapter: opening extension pages and painting the
   per-tab toolbar badge. Classic script that registers Sereno.browser.
   Outside the extension (pages opened from file://) chrome.* is missing:
   pages open with window.open and the badge is skipped. */

(function (Sereno) {
  "use strict";

  /* Pages live two levels below the extension root (app/<surface>/). */
  var PAGE_ROOT = "../../";

  function chromeRef() {
    return typeof chrome !== "undefined" ? chrome : undefined;
  }

  /* path is relative to the extension root, e.g. "app/admin/admin.html". */
  function openPage(path) {
    var ext = chromeRef();
    try {
      if (ext && ext.tabs && typeof ext.tabs.create === "function") {
        var url = ext.runtime && typeof ext.runtime.getURL === "function" ? ext.runtime.getURL(path) : PAGE_ROOT + path;
        ext.tabs.create({ url: url });
        return;
      }
      if (typeof window !== "undefined" && typeof window.open === "function") {
        window.open(PAGE_ROOT + path, "_blank");
      }
    } catch (error) {
      /* prototype: never block the UI on a navigation error */
    }
  }

  /* badge: { text, color } painted on the tab that hosts the calling page. */
  async function setTabBadge(badge) {
    var ext = chromeRef();
    try {
      var tab = await ext?.tabs?.getCurrent?.();
      var tabId = tab && tab.id;
      if (tabId === undefined || tabId === null) {
        return;
      }
      ext?.action?.setBadgeText?.({ tabId: tabId, text: badge.text });
      ext?.action?.setBadgeBackgroundColor?.({ tabId: tabId, color: badge.color });
    } catch (error) {
      /* prototype: the badge is cosmetic and never blocks the demo flow */
    }
  }

  Sereno.browser = {
    openPage: openPage,
    setTabBadge: setTabBadge
  };
})(globalThis.Sereno = globalThis.Sereno || {});

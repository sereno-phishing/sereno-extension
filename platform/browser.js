/* Platform · browser adapter: opening extension pages, painting the toolbar
   badge of a tab, messaging a tab and keeping per-tab records for the service
   worker. Classic script that registers Sereno.browser.
   Outside the extension (pages opened from file://) chrome.* is missing:
   pages open with window.open and the badge is skipped. */

(function (Sereno) {
  "use strict";

  /* Pages live two levels below the extension root (app/<surface>/). */
  var PAGE_ROOT = "../../";
  var TAB_KEY_PREFIX = "sereno.tab.";

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

  /* Paints text and colour on one real tab. Errors (a closed tab) reach the
     caller; outside the extension chrome.action is missing and nothing happens. */
  async function setBadge(tabId, text, color) {
    var ext = chromeRef();
    await ext?.action?.setBadgeText?.({ tabId: tabId, text: text });
    await ext?.action?.setBadgeBackgroundColor?.({ tabId: tabId, color: color });
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
      await setBadge(tabId, badge.text, badge.color);
    } catch (error) {
      /* prototype: the badge is cosmetic and never blocks the demo flow */
    }
  }

  /* Sends a message to the content script of a tab. A page without a content
     script (not loaded yet, or a page it cannot run on) is not an error. */
  async function notifyTab(tabId, message) {
    var ext = chromeRef();
    try {
      await ext?.tabs?.sendMessage?.(tabId, message);
    } catch (error) {
      if (!/receiving end|establish connection/i.test(String(error && error.message))) {
        throw error;
      }
    }
  }

  /* Id of the active tab of the focused window, null when there is none. */
  async function getActiveTabId() {
    var tabs = await chromeRef()?.tabs?.query?.({ active: true, lastFocusedWindow: true });
    var tab = tabs && tabs[0];
    return tab && tab.id !== undefined ? tab.id : null;
  }

  /* Per-tab records in chrome.storage.session: they outlive the ephemeral
     service worker but not the browser session. */
  function tabKey(tabId) {
    return TAB_KEY_PREFIX + tabId;
  }

  async function loadTabRecord(tabId) {
    var area = chromeRef()?.storage?.session;
    if (!area) {
      return null;
    }
    var found = await area.get(tabKey(tabId));
    var record = found && found[tabKey(tabId)];
    return record === undefined ? null : record;
  }

  async function saveTabRecord(tabId, record) {
    var area = chromeRef()?.storage?.session;
    if (area) {
      await area.set({ [tabKey(tabId)]: record });
    }
  }

  async function removeTabRecord(tabId) {
    var area = chromeRef()?.storage?.session;
    if (area) {
      await area.remove(tabKey(tabId));
    }
  }

  Sereno.browser = {
    openPage: openPage,
    setTabBadge: setTabBadge,
    setBadge: setBadge,
    notifyTab: notifyTab,
    getActiveTabId: getActiveTabId,
    loadTabRecord: loadTabRecord,
    saveTabRecord: saveTabRecord,
    removeTabRecord: removeTabRecord
  };
})(globalThis.Sereno = globalThis.Sereno || {});

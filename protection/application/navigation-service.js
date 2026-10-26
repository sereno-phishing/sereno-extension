/* Protection · navigation use case: turns a real http(s) navigation into a
   verdict, a tab badge, a popup-visible site and a message for the content
   script. Classic script that registers Sereno.navigationService. Runs in the
   service worker, which is ephemeral, so nothing lives in module state: the
   outcome of each tab is kept through the browser port.

   deps = { services, store, browser, now, options? }
     services  the composition root (Sereno.services); the provider stays hidden
     store     state store port: set(patch) publishes currentSite/protectionLevel
     browser   port: setBadge(tabId, text, color), notifyTab(tabId, message),
               getActiveTabId(), loadTabRecord/saveTabRecord/removeTabRecord
     now       () -> Date
     options   passed to Sereno.verdictService.evaluate (pendingAfterMs, timeoutMs)

   Tab message sent to the content script (contract for T6):
     { type: "sereno:outcome", outcome }   outcome as in verdict/domain/outcome.js
   A "pending" outcome may arrive first when the wait is noticeable, then the
   final one. The final message is sent again when the page finishes loading,
   because a content script injected at document_idle misses the first one, so
   receivers must treat equal outcomes as idempotent.

   Every function resolves and never throws: a failing provider, browser or
   store degrades the result, it does not break the navigation (fail-open). */

(function (Sereno) {
  "use strict";

  var outcomes = Sereno.verdictOutcome;
  var MESSAGE_TYPE = "sereno:outcome";

  /* A record without an outcome older than this is a dead evaluation (the
     worker was stopped), so the same url may be evaluated again. */
  var IN_FLIGHT_MS = 10000;

  /* Degraded marker: caution colour of the warning status, own glyph. */
  var DEGRADED_GLYPH = "?";

  var NOTIFY = { notify: true, active: false };
  var ACTIVATED = { notify: false, active: true };

  function isEvaluable(url) {
    if (typeof url !== "string") {
      return false;
    }
    try {
      var protocol = new URL(url).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  /* chrome.tabs.onUpdated payload -> { tabId, url } or null. A navigation
     starts with a "loading" event that carries the new url; "complete" repeats
     it once the document is ready. */
  function fromTabUpdate(tabId, changeInfo, tab) {
    var change = changeInfo || {};
    if (change.status === "loading" && change.url) {
      return { tabId: tabId, url: change.url };
    }
    if (change.status === "complete" && tab && tab.url) {
      return { tabId: tabId, url: tab.url };
    }
    return null;
  }

  function badgeOf(outcome) {
    if (outcome && outcome.kind === "verdict") {
      return Sereno.verdictUi.toolbarBadge(outcome.verdict.status);
    }
    if (outcome && outcome.kind === "degraded") {
      return { text: DEGRADED_GLYPH, color: Sereno.verdictUi.toolbarBadge("advertencia").color };
    }
    return Sereno.verdictUi.toolbarBadge("pendiente");
  }

  /* Runs one side effect; its failure never reaches the caller. */
  async function attempt(work) {
    try {
      return await work();
    } catch (error) {
      return undefined;
    }
  }

  function newToken(now) {
    return now().getTime().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  /* Only the active tab feeds the popup. knownActive skips the lookup when the
     event itself says the tab was just activated. */
  async function publish(deps, tabId, url, outcome, knownActive) {
    if (!knownActive) {
      var activeId = await attempt(function () {
        return deps.browser.getActiveTabId();
      });
      if (activeId === undefined || activeId === null || activeId !== tabId) {
        return;
      }
    }
    await attempt(function () {
      return deps.store.set({
        currentSite: outcomes.siteOf(outcome, url, Sereno.time.stamp(deps.now())),
        protectionLevel: outcomes.protectionLevel(outcome)
      });
    });
  }

  /* Shows an outcome: tab badge, popup state and, when asked, the tab message.
     mode = { notify, active } */
  async function present(deps, tabId, url, outcome, mode) {
    var badge = badgeOf(outcome);
    await attempt(function () {
      return deps.browser.setBadge(tabId, badge.text, badge.color);
    });
    await publish(deps, tabId, url, outcome, mode.active);
    if (mode.notify) {
      await attempt(function () {
        return deps.browser.notifyTab(tabId, { type: MESSAGE_TYPE, outcome: outcome });
      });
    }
  }

  async function loadRecord(deps, tabId) {
    var record = await attempt(function () {
      return deps.browser.loadTabRecord(tabId);
    });
    return record && typeof record === "object" ? record : null;
  }

  async function saveRecord(deps, tabId, record) {
    var saved = false;
    await attempt(async function () {
      await deps.browser.saveTabRecord(tabId, record);
      saved = true;
    });
    return saved;
  }

  async function handleNavigation(deps, navigation) {
    try {
      var tabId = navigation && navigation.tabId;
      var url = navigation && navigation.url;
      if (typeof tabId !== "number" || !isEvaluable(url)) {
        return null;
      }
      var now = deps.now;
      var existing = await loadRecord(deps, tabId);
      if (existing && existing.url === url) {
        if (existing.outcome) {
          await present(deps, tabId, url, existing.outcome, NOTIFY);
          return existing.outcome;
        }
        if (now().getTime() - existing.startedAt < IN_FLIGHT_MS) {
          return null;
        }
      }

      var token = newToken(now);
      var tracked = await saveRecord(deps, tabId, { token: token, url: url, startedAt: now().getTime(), outcome: null });
      var pendingJob = Promise.resolve();
      var settings = Object.assign({}, deps.options, {
        onPending: function (pending) {
          pendingJob = present(deps, tabId, url, pending, NOTIFY);
        }
      });
      var outcome = await Sereno.verdictService.evaluate(deps.services, url, settings);
      await pendingJob;

      if (tracked) {
        var current = await loadRecord(deps, tabId);
        if (!current || current.token !== token) {
          return null;
        }
        await saveRecord(deps, tabId, { token: token, url: url, startedAt: current.startedAt, outcome: outcome });
      }
      await present(deps, tabId, url, outcome, NOTIFY);
      return outcome;
    } catch (error) {
      return null;
    }
  }

  /* The popup shows the active tab, so switching tabs republishes that tab's
     stored outcome and refreshes its badge. The modal is not shown again. */
  async function handleTabActivated(deps, event) {
    try {
      var tabId = event && event.tabId;
      if (typeof tabId !== "number") {
        return;
      }
      var record = await loadRecord(deps, tabId);
      if (record && record.outcome) {
        await present(deps, tabId, record.url, record.outcome, ACTIVATED);
      }
    } catch (error) {
      /* the next navigation or activation repairs the state */
    }
  }

  async function handleTabRemoved(deps, event) {
    try {
      var tabId = event && event.tabId;
      if (typeof tabId !== "number") {
        return;
      }
      await attempt(function () {
        return deps.browser.removeTabRecord(tabId);
      });
    } catch (error) {
      /* a leftover record is cleared when the browser session ends */
    }
  }

  Sereno.navigationService = {
    MESSAGE_TYPE: MESSAGE_TYPE,
    isEvaluable: isEvaluable,
    fromTabUpdate: fromTabUpdate,
    badgeOf: badgeOf,
    handleNavigation: handleNavigation,
    handleTabActivated: handleTabActivated,
    handleTabRemoved: handleTabRemoved
  };
})(globalThis.Sereno = globalThis.Sereno || {});

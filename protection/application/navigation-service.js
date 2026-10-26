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

   Requests from the content script (handleMessage), sent with
   chrome.runtime.sendMessage; the sender tab says which record they concern:
     { type: "sereno:get-outcome" }       -> { ok, outcome|null, acknowledged? }
     { type: "sereno:continue", url }     -> { ok } | { ok:false, error }
     { type: "sereno:detail", url }       -> { ok }
   "continue" is accepted only for a warning of the same origin as the tab's
   record, never for a block. It is kept in the tab record (continued: [origin])
   so the warning is not shown again for that origin while the tab lives; the
   outcome message then carries acknowledged: true. The decision survives new
   navigations of the tab and is dropped with the tab record.
   "detail" opens the popup page (app/popup/popup.html) in a tab: it is the
   page that shows the verdict facts of the current site.

   Every function resolves and never throws: a failing provider, browser or
   store degrades the result, it does not break the navigation (fail-open). */

(function (Sereno) {
  "use strict";

  var outcomes = Sereno.verdictOutcome;
  var MESSAGE_TYPE = "sereno:outcome";
  var GET_OUTCOME = "sereno:get-outcome";
  var CONTINUE = "sereno:continue";
  var DETAIL = "sereno:detail";
  var DETAIL_PAGE = "app/popup/popup.html";

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

  function originOf(url) {
    try {
      return new URL(url).origin;
    } catch (error) {
      return null;
    }
  }

  /* True when the user already continued past this warning on the url's origin.
     Only a warning can be continued; a block is never acknowledged. */
  function isAcknowledged(record, url, outcome) {
    var origin = originOf(url);
    return (
      !!record &&
      Array.isArray(record.continued) &&
      origin !== null &&
      record.continued.indexOf(origin) >= 0 &&
      !!outcome &&
      outcome.kind === "verdict" &&
      outcome.verdict.status === "advertencia"
    );
  }

  /* A record with the origins the user continued on, when there are any. */
  function recordOf(base, continued) {
    var record = { token: base.token, url: base.url, startedAt: base.startedAt, outcome: base.outcome };
    if (Array.isArray(continued) && continued.length > 0) {
      record.continued = continued.slice();
    }
    return record;
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
      var message = { type: MESSAGE_TYPE, outcome: outcome };
      if (isAcknowledged(await loadRecord(deps, tabId), url, outcome)) {
        message.acknowledged = true;
      }
      await attempt(function () {
        return deps.browser.notifyTab(tabId, message);
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
      var tracked = await saveRecord(
        deps,
        tabId,
        recordOf({ token: token, url: url, startedAt: now().getTime(), outcome: null }, existing && existing.continued)
      );
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
        await saveRecord(
          deps,
          tabId,
          recordOf({ token: token, url: url, startedAt: current.startedAt, outcome: outcome }, current.continued)
        );
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

  /* ---------------- content script requests ---------------- */

  function isContentMessage(message) {
    return (
      !!message &&
      typeof message === "object" &&
      (message.type === GET_OUTCOME || message.type === CONTINUE || message.type === DETAIL)
    );
  }

  function refused(error) {
    return { ok: false, error: error };
  }

  async function replyWithOutcome(deps, tabId) {
    var record = await loadRecord(deps, tabId);
    if (!record || !record.outcome) {
      return { ok: true, outcome: null };
    }
    var reply = { ok: true, outcome: record.outcome };
    if (isAcknowledged(record, record.url, record.outcome)) {
      reply.acknowledged = true;
    }
    return reply;
  }

  async function acceptContinue(deps, tabId, url) {
    var origin = isEvaluable(url) ? originOf(url) : null;
    var record = await loadRecord(deps, tabId);
    if (origin === null || !record || !record.outcome) {
      return refused("no_outcome");
    }
    if (outcomes.blocksNavigation(record.outcome)) {
      return refused("blocked");
    }
    if (originOf(record.url) !== origin) {
      return refused("origin_mismatch");
    }
    if (record.outcome.kind !== "verdict" || record.outcome.verdict.status !== "advertencia") {
      return refused("not_continuable");
    }
    var continued = Array.isArray(record.continued) ? record.continued.slice() : [];
    if (continued.indexOf(origin) < 0) {
      continued.push(origin);
    }
    var saved = await saveRecord(deps, tabId, recordOf(record, continued));
    return saved ? { ok: true } : refused("storage");
  }

  async function openDetail(deps) {
    var opened = false;
    await attempt(async function () {
      await deps.browser.openPage(DETAIL_PAGE);
      opened = true;
    });
    return opened ? { ok: true } : refused("detail_unavailable");
  }

  /* Answers one content script request. sender is the runtime sender; only its
     tab matters. Resolves with the reply, never throws. */
  async function handleMessage(deps, message, sender) {
    try {
      if (!isContentMessage(message)) {
        return refused("unknown_message");
      }
      var tabId = sender && sender.tab && sender.tab.id;
      if (typeof tabId !== "number") {
        return refused("no_tab");
      }
      if (message.type === GET_OUTCOME) {
        return await replyWithOutcome(deps, tabId);
      }
      if (message.type === CONTINUE) {
        return await acceptContinue(deps, tabId, message.url);
      }
      return await openDetail(deps);
    } catch (error) {
      return refused("failed");
    }
  }

  Sereno.navigationService = {
    MESSAGE_TYPE: MESSAGE_TYPE,
    isContentMessage: isContentMessage,
    handleMessage: handleMessage,
    isEvaluable: isEvaluable,
    fromTabUpdate: fromTabUpdate,
    badgeOf: badgeOf,
    handleNavigation: handleNavigation,
    handleTabActivated: handleTabActivated,
    handleTabRemoved: handleTabRemoved
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Protection · navigation use case: turns a real http(s) navigation into a
   verdict, a tab badge, a popup-visible site and a message for the content
   script. Classic script that registers Sereno.navigationService. Runs in the
   service worker, which is ephemeral, so no data lives in module state: the
   outcome of each tab is kept through the browser port.

   deps = { services, store, browser, now, options? }
     services  the composition root (Sereno.services); the provider stays hidden
     store     state store port: set(patch) publishes currentSite/protectionLevel;
               currentSite is the site of an outcome (outcomes.siteOf) or the
               not-evaluated site (outcomes.notEvaluatedSite)
     browser   port: setBadge(tabId, text, color), notifyTab(tabId, message),
               getActiveTabId(), getTabUrl(tabId), assetUrl(path),
               loadTabRecord/saveTabRecord/removeTabRecord
     now       () -> Date
     options   passed to Sereno.verdictService.evaluate (pendingAfterMs, timeoutMs)

   Tab message sent to the content script (contract for T6):
     { type: "sereno:outcome", outcome }   outcome as in verdict/domain/outcome.js
   A "pending" outcome may arrive first when the wait is noticeable, then the
   final one. The final message is sent again when the page finishes loading,
   because a content script injected at document_idle misses the first one, so
   receivers must treat equal outcomes as idempotent.

   One navigation, several events, one request. A "loading" tab update opens a
   navigation (a new url, a hash change, a pushState route or a reload of the
   same url) and is evaluated against the backend, so the domain policy in
   force is the one applied; the backend caches by url, which keeps that
   cheap. "complete" and a tab activation only repeat the navigation that is
   already open: they show the stored outcome, or join the evaluation that is
   still running. Chrome may report "loading" twice for one navigation (when
   the tab starts loading and when it commits), so the tab record is marked
   navigating from the first "loading" until its "complete", which closes the
   navigation whether or not the verdict has arrived. A "loading" for the same
   url while the navigation is open is a repeat; after "complete" it is a
   reload and asks again. IN_FLIGHT_MS only bounds a navigation whose
   "complete" never arrives.
   The events of a tab are handled in arrival order (inTabOrder) and every
   evaluation carries a token kept in the tab record: an answer is stored and
   shown only while the record still carries its token, so the tab always ends
   with the answer of its newest request.

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

   Pages that are never evaluated: anything that is not http(s) (browser pages,
   other extensions, local files, about:blank) and the pages of the verdict
   backend itself (services.verdict.isOwnPage(url)). They get no request, no
   tab message, no badge and no outcome in the tab record, and when their tab
   is the active one the popup is told so with the not-evaluated site
   (outcomes.notEvaluatedSite()), never with the site of another tab.
   Two cases leave the popup state as it is: a tab whose address is unknown
   (not readable yet, or not a url), and the Sereno detail page, which exists
   to show the site it was opened for.

   The popup describes the active tab of the focused window, so the state is
   republished on a tab update, a tab activation and a window focus change.

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
     starts with a "loading" event (fresh: true); "complete" repeats it once the
     document is ready. The event carries the url only when it changed: a
     reload reports the status alone and the url is read from the tab. Before a
     navigation to another url commits, the tab still reports the page being
     left (and the next one as pendingUrl): that event is skipped, the commit
     brings the new url. */
  function fromTabUpdate(tabId, changeInfo, tab) {
    var change = changeInfo || {};
    if (change.status === "loading") {
      if (change.url) {
        return { tabId: tabId, url: change.url, fresh: true };
      }
      if (tab && tab.url && (!tab.pendingUrl || tab.pendingUrl === tab.url)) {
        return { tabId: tabId, url: tab.url, fresh: true };
      }
      return null;
    }
    if (change.status === "complete" && tab && tab.url) {
      return { tabId: tabId, url: tab.url };
    }
    return null;
  }

  /* True for a page of the backend the verdicts come from. The port decides;
     services without the predicate exempt nothing. */
  function isOwnPage(deps, url) {
    try {
      var port = deps.services.verdict;
      return typeof port.isOwnPage === "function" && port.isOwnPage(url) === true;
    } catch (error) {
      return false;
    }
  }

  /* True for the extension page that shows the facts of the current site. */
  function isDetailPage(deps, url) {
    try {
      if (typeof deps.browser.assetUrl !== "function") {
        return false;
      }
      var page = new URL(url);
      var detail = new URL(deps.browser.assetUrl(DETAIL_PAGE));
      return page.protocol === detail.protocol && page.host === detail.host && page.pathname === detail.pathname;
    } catch (error) {
      return false;
    }
  }

  /* What the navigation use case does with a url:
       "evaluate"  a web page: it gets a verdict
       "skip"      a page that is never evaluated (see the header)
       "ignore"    nothing can be said about it: no address, not a url, or
                   the Sereno detail page */
  function treatmentOf(deps, url) {
    if (typeof url !== "string") {
      return "ignore";
    }
    try {
      new URL(url);
    } catch (error) {
      return "ignore";
    }
    if (isDetailPage(deps, url)) {
      return "ignore";
    }
    return isEvaluable(url) && !isOwnPage(deps, url) ? "evaluate" : "skip";
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

  /* A record with the origins the user continued on, when there are any.
     navigating is kept only while the navigation that started the evaluation
     is still open (see "One navigation, several events"). */
  function recordOf(base, continued) {
    var record = { token: base.token, url: base.url, startedAt: base.startedAt, outcome: base.outcome };
    if (base.navigating === true) {
      record.navigating = true;
    }
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

  /* Tab events arrive a millisecond apart ("loading" and "complete" of a fast
     page, a pushState route), faster than a tab record is read and written
     back. Every step that reads the record and acts on it therefore runs in
     arrival order per tab; the verdict request itself runs outside the order,
     so a slow backend never holds the next event back. The queue holds no
     data: it only chains the steps of the events a live worker is handling,
     and is gone with the worker. */
  var tabOrder = new Map();

  function inTabOrder(tabId, step) {
    var run = (tabOrder.get(tabId) || Promise.resolve()).then(step);
    var settled = run.then(
      function () {},
      function () {}
    );
    tabOrder.set(tabId, settled);
    settled.then(function () {
      if (tabOrder.get(tabId) === settled) {
        tabOrder.delete(tabId);
      }
    });
    return run;
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

  /* A page that is never evaluated: whatever the tab showed before stops
     applying. The record of the previous page is dropped, which also discards
     an evaluation still running for it; only the origins the user continued on
     are kept. The badge is cleared and the active tab tells the popup that
     this page is not evaluated. */
  async function leaveUnevaluated(deps, tabId, url, knownActive) {
    var existing = await loadRecord(deps, tabId);
    if (existing && (existing.url !== url || existing.outcome)) {
      if (Array.isArray(existing.continued) && existing.continued.length > 0) {
        await saveRecord(
          deps,
          tabId,
          recordOf({ token: newToken(deps.now), url: url, startedAt: deps.now().getTime(), outcome: null }, existing.continued)
        );
      } else {
        await attempt(function () {
          return deps.browser.removeTabRecord(tabId);
        });
      }
    }
    await attempt(function () {
      return deps.browser.setBadge(tabId, "", Sereno.verdictUi.toolbarBadge("pendiente").color);
    });
    if (!knownActive) {
      var activeId = await attempt(function () {
        return deps.browser.getActiveTabId();
      });
      if (activeId === undefined || activeId === null || activeId !== tabId) {
        return;
      }
    }
    await attempt(function () {
      return deps.store.set({ currentSite: outcomes.notEvaluatedSite() });
    });
  }

  async function handleNavigation(deps, navigation) {
    try {
      var tabId = navigation && navigation.tabId;
      var url = navigation && navigation.url;
      if (typeof tabId !== "number") {
        return null;
      }
      var treatment = treatmentOf(deps, url);
      if (treatment === "skip") {
        await inTabOrder(tabId, function () {
          return leaveUnevaluated(deps, tabId, url, false);
        });
      }
      if (treatment !== "evaluate") {
        return null;
      }
      var opened = await inTabOrder(tabId, function () {
        return openNavigation(deps, tabId, url, navigation.fresh === true);
      });
      if (!opened.token) {
        return opened.outcome;
      }
      var pendingJob = Promise.resolve();
      var settings = Object.assign({}, deps.options, {
        onPending: function (pending) {
          pendingJob = inTabOrder(tabId, function () {
            return showPending(deps, tabId, url, pending, opened);
          });
        }
      });
      var outcome = await Sereno.verdictService.evaluate(deps.services, url, settings);
      await pendingJob;
      return await inTabOrder(tabId, function () {
        return closeEvaluation(deps, tabId, url, outcome, opened);
      });
    } catch (error) {
      return null;
    }
  }

  /* First step of an event, in tab order: decides from the tab record whether
     the event belongs to a navigation that is already known or starts an
     evaluation.
       -> { outcome }          a known navigation: its stored outcome was shown
                               again, or null while its evaluation is running
       -> { token, tracked }   a new evaluation was registered in the record
     A "loading" event repeats a navigation only while that navigation is open
     (no "complete" yet, bounded by IN_FLIGHT_MS); after "complete" it is a
     reload and always asks again, also while an earlier answer is still on its
     way: the new token makes that answer stale. "complete" closes the
     navigation whether or not the verdict has arrived, and never asks again
     unless the evaluation it would join is dead. */
  async function openNavigation(deps, tabId, url, fresh) {
    var now = deps.now;
    var existing = await loadRecord(deps, tabId);
    if (existing && existing.url === url) {
      var recent = now().getTime() - existing.startedAt < IN_FLIGHT_MS;
      var known = fresh ? existing.navigating === true && recent : !!existing.outcome || recent;
      if (known) {
        if (!fresh && existing.navigating === true) {
          await saveRecord(deps, tabId, recordOf(Object.assign({}, existing, { navigating: false }), existing.continued));
        }
        if (existing.outcome) {
          await present(deps, tabId, url, existing.outcome, NOTIFY);
        }
        return { outcome: existing.outcome || null };
      }
    }
    var token = newToken(now);
    var tracked = await saveRecord(
      deps,
      tabId,
      recordOf(
        { token: token, url: url, startedAt: now().getTime(), outcome: null, navigating: fresh },
        existing && existing.continued
      )
    );
    return { token: token, tracked: tracked };
  }

  /* True while the tab record still belongs to this evaluation. A record that
     could not be saved cannot say, so the evaluation is taken as current. */
  function isCurrent(opened, record) {
    return !opened.tracked || (!!record && record.token === opened.token);
  }

  /* The wait became noticeable: shown only while this evaluation is the one
     the tab waits for. */
  async function showPending(deps, tabId, url, pending, opened) {
    var current = opened.tracked ? await loadRecord(deps, tabId) : null;
    if (isCurrent(opened, current) && !(current && current.outcome)) {
      await present(deps, tabId, url, pending, NOTIFY);
    }
  }

  /* Last step of an evaluation, in tab order: the outcome is stored and shown
     only if the tab record still carries this evaluation's token. A newer
     navigation (another url, a reload, a page that is never evaluated)
     replaced the token, so an answer that arrives late is dropped: -> null. */
  async function closeEvaluation(deps, tabId, url, outcome, opened) {
    if (opened.tracked) {
      var current = await loadRecord(deps, tabId);
      if (!isCurrent(opened, current)) {
        return null;
      }
      await saveRecord(
        deps,
        tabId,
        recordOf(
          { token: opened.token, url: url, startedAt: current.startedAt, outcome: outcome, navigating: current.navigating },
          current.continued
        )
      );
    }
    await present(deps, tabId, url, outcome, NOTIFY);
    return outcome;
  }

  /* The popup shows the active tab, so switching tabs republishes that tab's
     stored outcome and refreshes its badge. The modal is not shown again. A
     tab on a page that is never evaluated says so; a tab without a record is
     looked up by its address (evaluated, skipped or left alone). */
  async function handleTabActivated(deps, event) {
    try {
      var tabId = event && event.tabId;
      if (typeof tabId !== "number") {
        return;
      }
      var unknown = await inTabOrder(tabId, async function () {
        var record = await loadRecord(deps, tabId);
        if (record && record.outcome) {
          await present(deps, tabId, record.url, record.outcome, ACTIVATED);
        } else if (record && treatmentOf(deps, record.url) === "skip") {
          await leaveUnevaluated(deps, tabId, record.url, true);
        }
        return !record;
      });
      if (unknown && typeof deps.browser.getTabUrl === "function") {
        var url = await deps.browser.getTabUrl(tabId);
        if (treatmentOf(deps, url) === "skip") {
          await inTabOrder(tabId, function () {
            return leaveUnevaluated(deps, tabId, url, true);
          });
        } else {
          await handleNavigation(deps, { tabId: tabId, url: url });
        }
      }
    } catch (error) {
      /* the next navigation or activation repairs the state */
    }
  }

  /* Another browser window got the focus: its active tab is now the one the
     popup describes. event = { windowId }; a negative id (no browser window
     has the focus) or no active tab leaves the state as it is. */
  async function handleWindowFocused(deps, event) {
    try {
      var windowId = event && event.windowId;
      if (typeof windowId !== "number" || windowId < 0) {
        return;
      }
      var tabId = await deps.browser.getActiveTabId();
      if (typeof tabId === "number") {
        await handleTabActivated(deps, { tabId: tabId });
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
      await inTabOrder(tabId, function () {
        return attempt(function () {
          return deps.browser.removeTabRecord(tabId);
        });
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
        return await inTabOrder(tabId, function () {
          return acceptContinue(deps, tabId, message.url);
        });
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
    handleWindowFocused: handleWindowFocused,
    handleTabRemoved: handleTabRemoved
  };
})(globalThis.Sereno = globalThis.Sereno || {});

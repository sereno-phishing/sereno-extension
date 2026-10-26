/* Background · MV3 service worker (classic). A thin shell: it imports the
   platform, provider, verdict and protection scripts, registers the tab
   listeners synchronously at the top level and delegates every event to
   Sereno.navigationService. It only knows Sereno.services, so switching the
   provider from mock to remote never touches this file. The worker is
   ephemeral: it keeps no state in globals (per-tab outcomes live in
   chrome.storage.session, the popup state in the shared state store) and uses
   no timers.

   Scripts that touch window or document (views, containers, molecules) are not
   imported. Paths are relative to this file. Order: platform, providers,
   domains, use cases, verdict badge atoms, navigation use case. */

importScripts(
  "../platform/storage.js",
  "../platform/seed.js",
  "../platform/state-store.js",
  "../platform/browser.js",
  "../platform/providers/config.js",
  "../platform/providers/ports.js",
  "../platform/providers/errors.js",
  "../platform/providers/mock.js",
  "../platform/providers/remote.js",
  "../platform/providers/index.js",
  "../time/domain/time.js",
  "../verdict/domain/verdict.js",
  "../verdict/domain/outcome.js",
  "../history/domain/history.js",
  "../demo-store/domain/scenarios.js",
  "../verdict/application/verdict-service.js",
  "../ui/atoms.js",
  "../verdict/ui/verdict-ui.js",
  "../protection/application/navigation-service.js"
);

/* The state store without its change watcher: the worker only writes, and a
   fresh store per event must not leave a storage listener behind. */
function openStore() {
  const Sereno = globalThis.Sereno;
  const storage = Sereno.storage.detect();
  return Sereno.stateStore.create({
    storage: { get: storage.get, set: storage.set },
    key: Sereno.stateStore.STORAGE_KEY,
    defaults: Sereno.seed.defaultState
  });
}

function buildDeps() {
  const Sereno = globalThis.Sereno;
  return {
    services: Sereno.services,
    store: openStore(),
    browser: Sereno.browser,
    now: () => new Date()
  };
}

async function onTabUpdated(tabId, changeInfo, tab) {
  const Sereno = globalThis.Sereno;
  const navigation = Sereno.navigationService.fromTabUpdate(tabId, changeInfo, tab);
  if (navigation) {
    await Sereno.navigationService.handleNavigation(buildDeps(), navigation);
  }
}

async function onTabActivated(activeInfo) {
  await globalThis.Sereno.navigationService.handleTabActivated(buildDeps(), { tabId: activeInfo && activeInfo.tabId });
}

async function onTabRemoved(tabId) {
  await globalThis.Sereno.navigationService.handleTabRemoved(buildDeps(), { tabId });
}

/* Requests from the content script (get-outcome, continue, detail). The reply
   is asynchronous, so the listener returns true to keep the channel open; any
   other message is left to its own receiver. */
function onRuntimeMessage(message, sender, sendResponse) {
  const navigation = globalThis.Sereno.navigationService;
  if (!navigation.isContentMessage(message)) {
    return false;
  }
  (async () => {
    sendResponse(await navigation.handleMessage(buildDeps(), message, sender));
  })();
  return true;
}

chrome.runtime.onMessage.addListener(onRuntimeMessage);
chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onRemoved.addListener(onTabRemoved);

# Feature: front-backend-ready

Branch: `feat/front-backend-ready`
Skills required: `chrome-extensions`, `modern-web-guidance`, `design-patterns`
Delivery strategy: ask-on-risk (forecast ~1500 authored lines; chain strategy to be asked before the second slice)

## Objective

Finish the Sereno front end at 100% so that connecting the backend means only
changing the provider and the base URL. No UI or use-case rewrite afterwards.

## Problem

- HU-04/05/22/25 only work inside the demo store: no service worker, no content script, no real-tab badge.
- No error, offline, timeout or degraded-protection states (HU-25/26).
- Use cases are synchronous and read `platform/seed.js` directly; passwords are compared in plain text.
- Nothing calls a backend; there is no provider seam.

## Scope

In: provider ports (verdict, auth, data) with mock and remote adapters, one config switch,
async use cases, service worker, content script, degraded/error UI, a11y, manifest cleanup, docs.
Out: the backend itself, ML, real persistence, metrics aggregation (HU-02, 06-12, 16, 27 training, 30, 31).

## Constraints

- Manifest V3, no eval, no inline scripts, async/await only, no state in service-worker globals (use `chrome.storage`).
- Classic scripts in the `globalThis.Sereno` namespace, no build step (README "Notas técnicas").
- `*/domain/*` stays pure; only `platform/` touches `chrome.*`.
- Strict TDD: RED then GREEN with `node --test` where a deterministic test applies.
- Per-task size heuristic ~400 authored changed lines (advisory only).
- Code, comments, UI copy in the existing project language (Spanish UI, English identifiers).

## Acceptance criteria

- Changing `provider` from `mock` to `remote` and setting `baseUrl` in a single config file is the only step to use a backend.
- Swapping in the backend touches at most 2 files: `platform/providers/config.js` and the remote adapter. UI, containers, domains and use cases never change.
- An architecture test enforces it: `fetch`, `XMLHttpRequest`, `chrome.runtime.sendMessage` to a backend and any `Sereno.providers.*` adapter are referenced only inside `platform/providers/`; everything else depends on the ports through one composition root (`Sereno.services`).
- Real navigation on http/https pages produces a verdict, badge and in-page modal using the mock provider.
- Timeout, offline and cache-down show a degraded state; nothing throws.
- `node --test` is green; README documents the provider contract.

## Tasks

- [x] T1 Provider ports, config switch, mock + remote adapters, composition root `Sereno.services`, architecture guard test (tests first)
- [x] T2 Async verdict service with timeout, offline and degraded states (HU-25/26)
- [x] T3 Auth provider port: session token, remove plain-text compare (HU-13/14/15)
- [x] T4 Data providers for history, policy, cache, metrics, model version, survey (HU-17-21, 27-29, 32)
- [x] T5 Service worker: navigation to verdict, real-tab badge, history write (HU-04/05/22/25)
- [x] T6 Content script: in-page modal for warn/block/pending/degraded (HU-05/22/25)
- [ ] T7 UI states and a11y: degraded banner, errors, focus trap, ARIA, reduced motion
- [ ] T8 Manifest cleanup (name, permissions, host_permissions, CSP, min Chrome) and README provider guide

## Route declaration

| Task | Route | Trigger evidence |
|---|---|---|
| T1-T8 | delegated direct, one writer at a time | each touches 2+ non-trivial files; audit already mapped the code (read-only explorer a77ccabee52997f4e) |

## Progress

T1 done: provider ports, config switch, mock and remote adapters, composition root `Sereno.services`, architecture guard. Not yet wired into any page (T2-T4).

T2 done: `verdict/domain/outcome.js` (Outcome model, fail-open rules), `verdict/application/verdict-service.js` (`evaluate(services, url, opts)`, own deadline, onPending, optional store publish) and a degraded protection level and card. Not yet wired into any page: script tags and the popup container passing the level come in T5-T7.

T3 done: `account/domain/account.js` is password-free (format validation, session `{username, role, loginAt, token}`, error messages); `Sereno.accountService` is async (`login/register/logout/currentSession(services, store, ...)`) and goes through `services.auth`; the mock adapter is the only place that checks the seed password and issues opaque tokens. The popup uses `Sereno.services`, loads the provider scripts, `outcome.js` and `verdict-service.js`, and passes `Sereno.protection.levelOf(state)` to `protectionCard()`. The admin page reads no session, so it is unchanged. Account views show offline/timeout/server messages.

T4 done: history, survey, model version, domain policy, cache and metrics go through `services.data`. New `platform/providers/errors.js` (`Sereno.providers.errors`: transport error codes to Spanish text and the normalized `{ok:false,error,message}`). `historyService.list/clear(services)`, `surveyService.saveDraft(store,answers)` / `submit(services,store,answers,now)`, `protectionService.loadModelVersion(services)`, `administrationService.loadDomains/saveDomains/addDomain/loadCache/saveTtl/invalidateDomain/loadMetrics(services,...)`, all async and never throwing. The mock plays the backend: it records history when it evaluates a site for a signed-in user and no longer calls any use case. The demo store evaluates recorded scenarios through `services.verdict.evaluate`. Popup shows loading/error states for history, survey result retry and the backend model version; every admin section has loading, empty and error states with retry. The stale auth comment in `ports.js` is fixed. Direct store access remains only for UI drafts, the session and `currentSite`.

T5 done: `background/service-worker.js` (classic MV3 worker: `importScripts` of platform, providers, domains, verdict and the navigation use case; registers `tabs.onUpdated/onActivated/onRemoved` synchronously; no globals, no timers, no `.then`). `protection/application/navigation-service.js` (`handleNavigation/handleTabActivated/handleTabRemoved/fromTabUpdate`) evaluates through `Sereno.verdictService`, paints the real-tab badge (safe, warning, block, pending `…`, degraded `?`), publishes `currentSite`/`protectionLevel` only for the active tab, keeps one record per tab in `chrome.storage.session` (a newer navigation on the tab invalidates an older result; the same url is not evaluated twice) and messages the tab. `platform/browser.js` gained `setBadge`, `notifyTab`, `getActiveTabId` and tab-record helpers; `setTabBadge` is unchanged for extension pages. Manifest declares the worker; permissions unchanged (`storage`, `tabs`). The worker imports no script that touches `window`/`document` (verified by loading them in Node) and ignores whether the provider is mock or remote. Not done on purpose: content script, host_permissions (T6), manifest cleanup (T8); README still says the prototype has no worker (T8). History write stays the backend's job through `verdict.evaluate`.

T6 done: real pages show the same verdict UI as the demo store. `demo-store/ui/verdict-modal.js` now builds one `card()` with two shells: `render` (demo overlay, markup unchanged) and `renderDialog` (native `<dialog>`: `showModal()` gives inert background, focus trap and focus return; warning `closedby="closerequest"`, block `closedby="none"` and the `cancel` event is prevented). `verdict/ui/page-overlay.js` (`Sereno.pageOverlay`) is pure: outcome to plan (`modal`, `toast`, `notice`, `none`), `decide(current, outcome, acknowledged)` (keep, render or clear: equal outcome is a no-op, a dismissed one is not reopened, a new one replaces) and `escCloses`/`backTarget`. `content/content-script.js` is the container: registers the listener at load, asks `sereno:get-outcome`, draws inside a closed shadow root appended to `<html>` with `<link>` stylesheets (`ui/tokens.css`, `ui/verdict-modal.css`, `content/content.css`); it never references services, providers or the network. Modal CSS moved out of `app/demo-store/store.css` into `ui/verdict-modal.css` (shared); `ui/tokens.css` variables also apply to `:host`; `Sereno.ui.setAssetRoot` points icons at the extension URL. `platform/browser.js` gained `onMessage`, `sendMessage` and `assetUrl`. The worker (`navigation-service.js` `handleMessage`, wired in `service-worker.js` with `chrome.runtime.onMessage`) answers `sereno:get-outcome`, `sereno:continue` (warning only, same origin as the tab record, stored as `continued: [origin]` in the per-tab record, kept across navigations of the tab; refused for a block) and `sereno:detail` (opens `app/popup/popup.html` in a tab: it is the only page that shows the verdict facts of the current site, so no new page was created). The outcome message gets `acknowledged: true` when the user already continued on that origin. Manifest: `content_scripts` (http/https, `document_idle`, top frame only) and `web_accessible_resources` limited to the stylesheets, logo and icons for http/https pages. Not exercised in real Chrome.

## Contracts

Tab message for the content script (T6), sent with `chrome.tabs.sendMessage`:

```
{ type: "sereno:outcome", outcome }
outcome = { kind: "verdict", verdict: { domain, status, score, source, latencyMs } }
        | { kind: "pending",  reason: "evaluating" }
        | { kind: "degraded", reason: "offline" | "timeout" | "server" | "cache_down" }
```

- A `pending` message may come first when the wait is over 300 ms; the final outcome always follows.
- The final outcome is sent again when the tab reports `complete` for the same url (a content script injected at `document_idle` misses the first one), so T6 must treat an equal outcome as idempotent and render the modal once.
- Only `verdict` with status `bloqueo` blocks (`Sereno.verdictOutcome.blocksNavigation`); `degraded` never blocks (fail-open) but must show the degraded notice (`Sereno.verdictOutcome.notice`).
- Optional `acknowledged: true` on the same message (T6): the user already continued past a warning on this origin in this tab, so the receiver renders nothing for that warning. It is never set for a block.
- Requests from the content script to the worker (`chrome.runtime.sendMessage`): `{type:"sereno:get-outcome"}` replies `{ok, outcome|null, acknowledged?}`; `{type:"sereno:continue", url}` replies `{ok}` or `{ok:false, error}` (`blocked`, `origin_mismatch`, `not_continuable`, `no_outcome`, `storage`, `no_tab`); `{type:"sereno:detail", url}` replies `{ok}`.
- The message is not sent on tab activation; the popup state (`currentSite`, `protectionLevel`) and the badge are refreshed instead.
- Per-tab record in `chrome.storage.session`, key `sereno.tab.<tabId>`: `{ token, url, startedAt, outcome|null }`.

## Verification evidence

Baseline: `node --test` = 66 pass, 0 fail (before changes).

T1:
- RED: with only the tests written, `node --test` = 68 pass, 1 fail (`tests/providers.test.js` could not load, `platform/providers/*` missing). `tests/architecture.test.js` passed trivially (no violations existed yet); its detection was checked by adding a temporary file with `fetch(`, which failed the test, then removing it.
- GREEN: `node --test` = 89 pass, 0 fail (66 baseline + 23 new).
- Commit: 6b206b0

T2:
- RED: tests written first (`tests/verdict-outcome.test.js`, `tests/verdict-service.test.js`, `tests/degraded-protection.test.js`); `node --test` = 3 test files failing to load (`verdict/domain/outcome.js`, `verdict/application/verdict-service.js` missing; protection helpers undefined).
- GREEN: `node --test` = 119 pass, 0 fail (89 baseline + 30 new). Mock failures are injected by wrapping the verdict port (mock.js has no failure seam); remote failures use a fake fetch.
- Commit: 54aa970

T3:
- RED: tests written first (`tests/account.test.js`, `tests/account-service.test.js`, `tests/providers.test.js` contract); `node --test` = 138 tests, 113 pass, 25 fail (first failures: `mock: login stores the sanitized user and the token, never the password`, then the remote equivalents and the provider auth contract).
- GREEN: `node --test` = 141 pass, 0 fail (119 baseline, two obsolete plain-text tests removed from `use-cases.test.js`, 22+ new). `rg -n "password" account/domain` shows only parameter names of `validateCredentials` and comments; no comparison.
- Commit: 576e70f

T4 (two work units):
- Unit A (popup side) RED: `tests/data-services.test.js` written first; `node --test` = 142 tests, 141 pass, 1 fail (the file could not load: `platform/providers/errors.js` missing). GREEN: `node --test` = 159 pass, 0 fail (141 baseline, 3 obsolete store-based tests removed from `use-cases.test.js`, 21 new). The two `.then` in the popup login/register handlers stay: an async function adds a microtask and breaks the popup tests' timing. Commit: addb8df
- Unit B (admin side) RED: admin tests appended first; `node --test` = 174 tests, 159 pass, 15 fail (first: `mock: administrationService loads and saves the domain policy`, `loadDomains` not a function). GREEN: `node --test` = 177 pass, 0 fail (the obsolete store-based administration test removed, so `tests/use-cases.test.js` was deleted; 4 container tests in `tests/admin-page.test.js`). Commit: 6890b11
- `rg -n "Sereno.seed|state\.(history|domains|cache|metrics)" history survey administration protection app` = no hits.

T5:
- RED: `tests/navigation-service.test.js`, `tests/browser.test.js` and `tests/service-worker.test.js` written first; with `navigation-service.js` and `service-worker.js` absent and `platform/browser.js` untouched, `node --test` = 185 tests, 178 pass, 7 fail (the 5 `browser.test.js` tests, first `setBadge paints text and colour on the given real tab`, plus the 2 files that could not load).
- GREEN: `node --test` = 204 pass, 0 fail (177 baseline + 27 new). One test bug found on the way: activating a tab must publish without asking which tab is active (the event already says so).
- `tests/service-worker.test.js` loads every imported script in Node through a fake `importScripts`, so a `window`/`document` access at load would fail the test; it also asserts the three listeners exist right after `require` and that the source has no timers, `.then`, `fetch(`, adapter references or top-level state.
- `tests/architecture.test.js` still passes (background/ and protection/ have no network or adapter references).
- Commit: 6ca8a82

T6:
- RED: tests written first (`tests/verdict-modal.test.js`, `tests/content-overlay.test.js`, `tests/content-script.test.js`, `tests/content-browser.test.js`, `tests/manifest.test.js`, plus new cases in `tests/navigation-service.test.js` and `tests/service-worker.test.js`); `node --test` = 235 tests, 206 pass, 29 fail (first failures: `onMessage subscribes once...` in `content-browser.test.js`, then `tests/content-overlay.test.js` and `tests/content-script.test.js` could not load, then the manifest `content_scripts` tests and `setAssetRoot is not a function`).
- GREEN: `node --test` = 261 pass, 0 fail (204 baseline + 57 new).
- `rg -n "services|fetch\(" content` = no hits; `tests/architecture.test.js` passes; every file in `content_scripts.js`, `web_accessible_resources` and the three stylesheets exists (also enforced by `tests/manifest.test.js`).
- Nothing was exercised in real Chrome: the shadow-root `<link>` stylesheets, the native dialog behaviour, the page CSP interaction and the focus return are covered only by fake-DOM tests and must be checked by hand.
- Commits: 6f944aa (view, container, CSS, browser port), 5e046f4 (worker actions, manifest)

T8 must review (found in T6):
- Manifest `name`/`description`, CSP, `minimum_chrome_version` (native `<dialog closedby>` is progressive; `showModal()` needs no minimum, `chrome.storage.session` needs 102).
- Host access: `content_scripts.matches` is `http://*/*`, `https://*/*`; decide whether `host_permissions` is needed (the worker only uses `tabs`) and justify the broad match for the store listing.
- `web_accessible_resources` exposes stylesheets, logo and icons to every http/https page (pages can fingerprint the extension); consider `use_dynamic_url`.
- In real Chrome verify that a strict page CSP (`style-src`) does not block the extension `<link>` inside the shadow root; if it does, fall back to a `content_scripts.css` entry or a constructed stylesheet.
- `@font-face` does not apply inside a shadow root, so the modal uses the system sans-serif font on real pages; load Inter in the page document or accept the fallback.
- SPA navigation (`pushState`) is not seen by the worker (`tabs.onUpdated` only reports loading/complete), so a client-side route change is not re-evaluated.
- README "Notas técnicas" still says the prototype has no service worker and lists only `storage` and `tabs`.
- The modal and `demo-overlay` demo variants still differ in a11y (the demo store overlay keeps the old div markup, no inert/focus trap): T7.

## Next step

Launch the writer for T7 (UI states and a11y: degraded banner in the popup, error states, focus trap and ARIA for the demo overlay and the remaining views, reduced motion). The T8 review list is under "T8 must review" in the verification evidence.

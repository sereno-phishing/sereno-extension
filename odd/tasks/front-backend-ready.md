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
- [ ] T6 Content script: in-page modal for warn/block/pending/degraded (HU-05/22/25)
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

## Next step

Launch the writer for T6 (content script: in-page modal for warn/block/pending/degraded, consuming the `sereno:outcome` message under "Contracts"; adds `content_scripts`/`host_permissions` to the manifest and must be idempotent per outcome).

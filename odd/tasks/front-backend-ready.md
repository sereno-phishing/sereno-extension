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
- [x] T7 UI states and a11y: degraded banner, errors, focus trap, ARIA, reduced motion
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

T7 done: degraded state, session refresh and an a11y baseline, all verified at string/fake-DOM level.
- Degraded: `.protection-card.is-degraded` (amber tokens) in `popup.css`; both protection cards are `role="status"`; `siteCard(site, level)` has `is-pending` (`aria-busy`, `role="status"`) and `is-degraded` (note "No se pudo comprobar este sitio") variants; the popup passes `protectionLevel(state)` to it.
- Boot: the first render is unchanged (no extra tick); after it `refreshSession()` calls `accountService.currentSession(services, store)`. Offline, failing or unverified keeps the local session and shows `.session-notice` (`role="status"`, retry action `retry-session`); a session the backend dropped sends the user home. `popup.html` ships a `.boot-skeleton` (`aria-busy` on `#app`, cleared on the first render); `admin.html` ships a loading status. The page-wide `aria-live` on `#app` (popup, admin) was removed because it announced every render.
- A11y: `ui.input` takes `id/ariaLabel/labelledBy/invalid/describedBy/autocomplete`; `ui.field` names the input from its label span and links help text; login/register declare `autocomplete` and tie `#form-error` (`role="alert"`) to the fields with `aria-invalid`/`aria-describedby`. Popup tabs: `tablist` (labelled), `tab` with `id`, roving `tabindex`, `aria-controls` on the selected tab only, `tabpanel` wrapper (`display: contents`), Arrow/Home/End handled in the container. One `h1` per popup view (`sr-only` on home, history, detail, survey result). Clear-history confirmation: `aria-labelledby/describedby`, page behind it `inert`, Tab trapped (`ui.trapTab`), Esc and focus return; account menu: `aria-expanded`, focus in and out, arrow keys. `ui.captureFocus` keeps focus across `innerHTML` redraws in popup and admin. Admin: skip link, `main#main`, `th scope`, table captions, hidden "Acciones" header, labelled inputs/TTL fields, chip labels per domain, chart `role="img"`. Demo store: `main` + `h1`, overlay focus into the card, inert background, Tab trap, Esc closes a warning only. Privacy: `aria-labelledby`. Decorative glyphs, chevrons, onboarding art and sparklines are `aria-hidden`.
- Styles: shared `.sr-only`, `.skip-link`, `.tab-panel` and one `:focus-visible` ring in `ui/tokens.css` (the `.input:focus` outline removal is gone); reduced motion in every animating stylesheet (popup, store, content; the skeleton pulse runs only under `no-preference`). Tokens changed because pairs failed AA: `--muted` #64748B to #5B6A80 (4.32 on `--soft`, 4.48 on `--page`), `--subtle` #94A3B8 to #606F85 (2.56 on white; used for placeholders and the model label), placeholder #9CA3AF replaced by `--subtle` (2.54), `.chip-seguro`/`.chip-advertencia` fills green-600/amber-600 to green-700/amber-700 (3.30 and 3.19 with white text).
- Empty/loading/error audit, still open: login/register have no "sending" state (the submit button stays active while the request runs); the history detail for an unknown id reuses the "No hay sitios con este resultado" message; the `←` of the back links is read by screen readers (the exact-markup tests pin it); `demo-toast`/`demo-tooltip` toggle `display`, so a screen reader may not announce them; popup.css/admin.css colours that are not token pairs (pills, stat bars) were not scanned. Everything else has loading, empty and error handling (history, survey result, every admin section, boot, offline session, verdict modal and page notices).

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

T7 (three work units):
- RED: unit A tests first (`tests/degraded-protection.test.js`, `tests/popup-navigation.test.js`, `tests/popup-tabs.test.js`); `node --test` = 271 tests, 262 pass, 9 fail (first: `both protection cards are live regions so a change of level is announced`). GREEN: 271 pass. Commit: 59690ee
- Unit B RED: `tests/a11y-views.test.js` written first (20 tests); with the views untouched 6 of them failed after the first pass of atoms/helpers (first failure `every popup view passes the structural scan and has exactly one h1`), the rest of the suite stayed green. GREEN: 294 pass after the containers got focus handling and 3 existing tests were adjusted for new attributes (`tests/ui.test.js` field ids and `aria-hidden` glyph, `tests/popup-tabs.test.js` tabindex/aria-controls normalisation). Commit: cb4b33e
- Unit C RED: `tests/a11y-styles.test.js` first; 7 failures (reduced motion 7-sheet count, store reduce block, focus-visible rule, `.input:focus` outline removal, `muted on page 4.48:1`, `.chip-seguro 3.30:1`, placeholder token). GREEN: `node --test` = 305 pass, 0 fail. Commit: d25f319; the admin loading status (one more test): 306 pass, commit 17cdb82.
- `rg -c "aria-|role=" app ui account history survey administration protection onboarding demo-store --glob "*.{js,html}"` lines with a match: 34 before, 67 after (popup-views 3 to 5, popup.html 1 to 2, admin-views 3 stays 3, admin.html 1 to 0 on purpose, history 2 to 5, survey 1 to 3, atoms 2 to 7, privacy 0 to 1, account 5 to 7, administration 1 to 7).
- `rg -n "prefers-reduced-motion" --glob "*.css"`: content.css (`no-preference`), popup.css (tab indicator `reduce`, skeleton pulse `no-preference`), store.css (`reduce`); admin.css, privacy.css, tokens.css and verdict-modal.css have no animation or transition, and `tests/a11y-styles.test.js` fails any stylesheet that adds one without the media query.
- Nothing was exercised in real Chrome or with a screen reader.

T8 must review (found in T6):
- Manifest `name`/`description`, CSP, `minimum_chrome_version` (native `<dialog closedby>` is progressive; `showModal()` needs no minimum, `chrome.storage.session` needs 102).
- Host access: `content_scripts.matches` is `http://*/*`, `https://*/*`; decide whether `host_permissions` is needed (the worker only uses `tabs`) and justify the broad match for the store listing.
- `web_accessible_resources` exposes stylesheets, logo and icons to every http/https page (pages can fingerprint the extension); consider `use_dynamic_url`.
- In real Chrome verify that a strict page CSP (`style-src`) does not block the extension `<link>` inside the shadow root; if it does, fall back to a `content_scripts.css` entry or a constructed stylesheet.
- `@font-face` does not apply inside a shadow root, so the modal uses the system sans-serif font on real pages; load Inter in the page document or accept the fallback.
- SPA navigation (`pushState`) is not seen by the worker (`tabs.onUpdated` only reports loading/complete), so a client-side route change is not re-evaluated.
- README "Notas técnicas" still says the prototype has no service worker and lists only `storage` and `tabs`.
- The demo overlay keeps the div markup but now has inert background, focus trap, focus return and Esc (T7); it is still not a native `<dialog>`.
- Not exercised in real Chrome or with a screen reader (T7): focus restoration after redraws, `inert`, `display: contents` on the tab panel, tab and menu keyboard behaviour, the skip link and the focus ring must be checked by hand.

## Next step

T8: manifest cleanup (name, permissions, host_permissions, CSP, min Chrome) and the README provider guide, using the "T8 must review" list above. Then a manual pass in real Chrome with the keyboard and a screen reader for the T7 items.

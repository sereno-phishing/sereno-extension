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
- [x] T8 Manifest cleanup (name, permissions, host_permissions, CSP, min Chrome), README provider guide and the end-to-end swap proof
- [x] T9 Popup fixes from first real-Chrome review (site card for every role, one model version independent of the session)
- [x] T10 Localhost test hosts for real-page verification (`*.localhost` verdicts in the mock adapter)
- [x] T11 In-page UI without web-accessible resources (styles and icons bundled into the content script)

## Route declaration

| Task | Route | Trigger evidence |
|---|---|---|
| T1-T11 | delegated direct, one writer at a time | each touches 2+ non-trivial files; audit already mapped the code (read-only explorer a77ccabee52997f4e) |

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

T8 done: the front end is closed locally. Nothing was loaded in real Chrome.
- Manifest (`manifest.json`): `name` "Sereno", Spanish store description (119 chars, no "prototipo"/"Sprint"), `version` 0.2.0 (0.1.0 was the prototype), `minimum_chrome_version` "102", explicit `content_security_policy.extension_pages` = `script-src 'self'; object-src 'self'` (same as the MV3 default, now visible and tested; `connect-src` is deliberately not restricted), `host_permissions: []`, `web_accessible_resources` cut from a glob over every icon to 5 exact files + 3 stylesheets + the logo.
- Why 102 (JSON has no comments, so it lives here): `chrome.storage.session` (Chrome 102) is used by the worker for per-tab records; the `inert` attribute (102) is used by the popup and the demo store; the service worker, `chrome.action` and `:where()` need 88 or less; `showModal()` needs no minimum; `<dialog closedby>` is progressive and ignored by older engines.
- Permissions, each justified: `storage` (shared state in `local`, per-tab results in `session`); `tabs` (the worker reads `tab.url`/`changeInfo.url`; without `tabs` or host permissions Chrome hides the URL, and `activeTab` cannot work because there is no user gesture). No `scripting` (the content script is declared), no `activeTab`, no `<all_urls>`. `content_scripts.matches` http/https is broad on purpose: protecting any visited site is the product; for the store listing the single-purpose statement is "check each visited address for phishing and warn before the user enters data".
- Cross-origin decision for the remote adapter: **`host_permissions` with the backend origin** (recommended) instead of CORS. Reasons: fixed first-party origin, narrowest grant (one origin, https only), no need to configure `Access-Control-Allow-Origin: chrome-extension://<id>` plus credentials and preflight on the backend. `optional_host_permissions` was rejected: `chrome.permissions.request` needs a user gesture and new UI code, and the verdict runs in the background. CORS remains a valid alternative if the backend team prefers it.
- **Swap touch points, honest count: three, not two.** (1) `platform/providers/config.js` always; (2) `manifest.json` `host_permissions` unless the backend answers CORS for the extension origin; (3) `platform/providers/remote.js` only if the real API differs from the documented contract. The original acceptance criterion said "at most 2 files"; that holds only when the backend follows the contract AND sends CORS, otherwise the manifest is a second edit. The empty `host_permissions` key is the marked place (JSON allows no comment, and an unknown key would raise a warning in `chrome://extensions`). `tests/manifest.test.js` fails when `config.js` says `remote` and `host_permissions` is not exactly `<baseUrl origin>/*` over https, so the edit cannot be forgotten. Cookie sessions need `Secure; SameSite=None` on the backend (unverified).
- Swap proof (`tests/provider-switch.test.js`): 15 scenarios plus 3 wiring checks. Each builds a fresh `Sereno` namespace from the real scripts, applies only config values (`provider`, `baseUrl`, timeouts) and runs the real use cases: login/session/logout/register, evaluate (safe, warning, block, unknown), degraded on timeout/offline/server/cache_down for verdict, history, model and metrics, history list/delete, admin policy, cache, metrics and model, survey submit, and `navigationService.handleNavigation` (badge, tab message, popup state) including the four failures. The remote run uses `globalThis.fetch` where the real adapter finds it, against a fake backend that serves the REST contract on top of a private mock instance. Results must be `deepEqual` and also match explicit expectations. Sensitivity checked by mutation: renaming the verdict path made 9 tests fail, mapping network errors to `server` made 2 fail.
- Architecture (`tests/architecture.test.js`, +2): only `platform/providers/index.js` reads `Sereno.providers.config`; `baseUrl` appears only in `config.js`, `index.js` and `remote.js`, and no file other than `config.js` hard-codes a value. Detection checked with a temporary violating file.
- README rewritten: intro without "prototipo"/"sin service worker", Chrome 102, real-tab testing, HU map with status (HU-26 added), project tree, technical notes (worker, content script, badge glyphs, tab message contract, permissions, CSP, exposed resources), the "Conectar el backend" guide (touch point table, steps, REST table, ports, fail-open, demo accounts) and a manual Chrome checklist. The `tabs.getCurrent()` claim is gone. "Skills obligatorios" kept.
- Comment-only edits to `config.js` (hand-off checklist) and `remote.js` (cross-origin and cookie note).
- Resolution of "T8 must review": manifest identity, CSP and min Chrome done; host access decided and tested; WAR trimmed to exact files (derived by a test that renders every in-page plan); `use_dynamic_url` not applied (needs Chrome 130, would raise the minimum; the cost is that pages can fingerprint the extension); strict page CSP, `@font-face` in the shadow root, SPA `pushState` navigation, `inert`/focus checks and the screen reader pass remain manual (README checklist); README "Notas técnicas" corrected; the demo overlay stays a div on purpose.
- Open item `protectionReason` (from T7): not solved. The popup's `protectionCard(level, reason)` already accepts a reason, but the shared state stores only `protectionLevel`, so the popup cannot say why protection is degraded. The fix needs `protection/application/navigation-service.js` (publish the reason), `verdict/domain/outcome.js` or `platform/seed.js` (state shape) and `app/popup/popup-page.js` (pass it); all outside T8's allowed surfaces. Listed in the README HU table.

T9 done: two Sprint 1 inconsistencies found in the first real-Chrome review, both wrong for a backend-ready front end.
- Site card: `popupViews.home` builds `siteCard` once and shows it signed out (plus icon legend, which stays signed-out only), for a user (inside the `tabpanel-home` wrapper, between the protection card and the model notice) and for admin (between the protection card and the admin card). One `h1`, tabpanel and live regions unchanged.
- Model version: removed `MODEL_VERSION`, `UPDATED_MODEL_VERSION` and `modelVersion(state)` from `protection/domain/protection.js`. `isNoticeVisible(state, backendVersion)` is pure and data driven: signed in, a backend version known, and `state.lastSeenModelVersion !== backendVersion`; the legacy `modelNoticeDismissed === true` still hides it. `dismissModelNotice(store, version)` stores `lastSeenModelVersion` and resets the old flag to false. The mock backend reports the constant `Sereno.seed.modelVersion = "1.3"`; the seed starts `lastSeenModelVersion: "1.2"`, so the demo still shows the "v1.3" notice after the first login while the footer says v1.3 everywhere. `getModelVersion() -> {ok, version}`, the remote adapter and the ports are untouched. The popup asks for the version once per user (the key no longer includes the dismissed flag) and passes `App.modelVersion` when dismissing.
- Known limit: a legacy state saved with `modelNoticeDismissed: true` keeps the notice hidden until that user dismisses again (it cannot be told which version they saw); fresh and new states behave per version.
- README: sentence about who sees "Este sitio" and the HU-27 row corrected.

T10 done: the fake scenario domains do not resolve, so content scripts never ran on them. The mock adapter now recognizes `seguro|advertencia|bloqueo|pendiente|degradado.localhost` (table `TEST_HOSTS` in `platform/providers/mock.js`, after the `www.` strip; ports ignored). Scenario hosts reuse `Sereno.demoScenarios.SCENARIOS` data with `domain` set to the hostname; `pendiente.localhost` waits `PENDING_HOST_DELAY_MS` (1500 ms, above the 300 ms threshold; injectable as `pendingHostDelayMs`) and resolves safe; `degradado.localhost` returns `errors.failure("server")` (degraded, fail-open, not recorded in history). Remote adapter, ports and contract untouched. README: new subsection "Probar advertencia, bloqueo, pendiente y degradado en páginas reales". Nothing was exercised in real Chrome.

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

T8 (five work units):
- Swap proof: `tests/provider-switch.test.js` written first (18 tests). It passed on the first run because it verifies existing behavior; its value was shown by mutation instead: renaming `/v1/verdict` in `remote.js` failed 9 tests, mapping network errors to `server` failed 2, both reverted with `git checkout`. `node --test` = 324 pass. Commit: c438aa6
- Manifest RED: tests rewritten first in `tests/manifest.test.js` (11 tests); with the old manifest `node --test tests/manifest.test.js` = 11 tests, 6 pass, 5 fail (first: `web accessible resources are exactly the files the in-page UI loads`, then name/description, minimum Chrome, CSP, host_permissions). GREEN: full `node --test` = 329 pass, 0 fail (306 + 18 + 5). Commit: 9648991
- Architecture: 2 tests added (they passed at once because no violation exists). Detection checked by adding `history/tmp-violation.js` (read of `Sereno.providers.config` and a hard-coded `baseUrl`): both new tests failed; file removed. Commit: f9dcf95
- Docs: comment-only edits to `config.js` and `remote.js` (5947e5c); README rewrite (7ae1138).
- Final: `node --test` = 331 tests, 331 pass, 0 fail (306 baseline + 18 switch + 5 manifest + 2 architecture).
- `manifest.json` parses (`node -e require`) and every referenced file exists: `tests/manifest.test.js` checks content script js, web accessible resources, icons, popup and options page.
- `rg -n "baseUrl" --glob "*.js" -l` outside tests: `platform/providers/config.js`, `platform/providers/index.js`, `platform/providers/remote.js`; `providers.config` is read outside `config.js` only by `platform/providers/index.js`.
- Nothing was loaded in real Chrome, against a real backend or with a screen reader.

T9:
- RED: tests first (`tests/popup-site-card.test.js` 8, `tests/protection-service.test.js` 3, rewritten domain test in `tests/protection.test.js`, 2 container tests in `tests/popup-navigation.test.js`); `node --test` = 347 tests, 335 pass, 12 fail (first failure `dismissing the model notice stores the version the backend reported`).
- Existing tests changed because session-dependent behavior was removed on purpose: `tests/providers.test.js` (mock model version 1.3 logged out), `tests/data-services.test.js` (label test with `lastSeenModelVersion`, and `loadModelVersion` returns 1.3 before and after login), `tests/popup-tabs.test.js` (stub gained `siteCard`).
- GREEN: `node --test` = 347 tests, 347 pass, 0 fail (331 baseline + 16 new). `tests/provider-switch.test.js` and `tests/architecture.test.js` pass unchanged (mock == remote).
- `rg -n "UPDATED_MODEL_VERSION|modelNoticeDismissed" --glob "!tests/**" .`: remaining hits are the legacy read in `protection/domain/protection.js` and the reset to false in `protection-service.js`, both intentional.
- Nothing was exercised in real Chrome.
- Commit: 33d11f6

T10:
- RED: `tests/mock-test-hosts.test.js` (10 tests) written first; `node --test` = 357 tests, 350 pass, 7 fail (first: `scenario hosts return the scenario verdict with the real hostname as domain`).
- GREEN: `node --test` = 357 tests, 357 pass, 0 fail (347 baseline + 10 new); `tests/provider-switch.test.js` and `tests/architecture.test.js` pass unchanged.
- Nothing was exercised in real Chrome.
- Commits: bc8a154 (mock + tests), 6848afe (README); this document was updated in a later docs commit.

T11:
- Why: in real Chrome 156 on https://www.youtube.com/ the content script logged three times "Unsafe attempt to load URL chrome-extension://<id>/ui/tokens.css (verdict-modal.css, content.css) from frame with URL https://www.youtube.com/" at `ensureSurface` (`doc.documentElement.appendChild(host)`, where the shadow-root `<link>` elements start loading) even though the files were listed in `web_accessible_resources` for http/https. The cause was not proven; the design stops depending on page-context loads of extension URLs.
- Design: `tools/build-content-assets.js` (plain Node, deterministic, LF, `--check`) writes the committed `content/content-assets.generated.js` (`Sereno.contentAssets = { css, icons }`). The content script builds a `CSSStyleSheet` (`replaceSync`) and sets `shadow.adoptedStyleSheets`; fallback `<style>` when unsupported. `Sereno.ui.setInlineAssets(map)` switches `ui/atoms.js` to inline svg (`icon`, `image`, `logo`, new `sizedIcon`); default `<img>` behavior of popup, admin and demo store is unchanged. `@font-face` is dropped from the bundle (its relative url would resolve against the host page); Inter does not apply in-page. Logo: the PNG becomes the inline `brand` svg (a `data:` image would still be subject to the page `img-src`); no PNG is bundled. `web_accessible_resources` removed from the manifest, which also stops pages from probing for the extension. The bundle is listed after `ui/atoms.js` and before `content/content-script.js`.
- RED: tests first (`tests/content-assets.test.js` new, `tests/content-script.test.js` and `tests/manifest.test.js` rewritten for the new guarantee); `node --test` = 343 tests, 338 pass, 5 fail (first: `tests\content-assets.test.js` could not load, `tools/build-content-assets.js` missing; then `tests\content-script.test.js`, and three manifest tests: no `web_accessible_resources`, bundle order, no extension URL in the content script).
- GREEN: `node --test` = 371 tests, 371 pass, 0 fail (357 baseline, minus the replaced WAR derivation test, plus 3 new manifest tests, 4 new content-script tests and 8 in `tests/content-assets.test.js`). `node tools/build-content-assets.js --check` exit 0. `tests/architecture.test.js` and `tests/provider-switch.test.js` pass unchanged.
- Existing tests changed on purpose: `tests/manifest.test.js` (the WAR derivation test replaced by "no web_accessible_resources", bundle order and "content script names no extension URL"), `tests/content-script.test.js` (the `<link>` stylesheet test replaced by adopted-sheet, `<style>` fallback and "no link, no assetUrl call" tests).
- `rg -n "chrome-extension://|web_accessible_resources|assetUrl" content manifest.json` = no hits in `content/content-script.js`, `content/content.css` or `manifest.json`.
- Nothing was exercised in real Chrome. To re-check there: YouTube console free of the three errors; modal styled on `http://advertencia.localhost:8080` and `http://bloqueo.localhost:8080` with icons visible; a strict-CSP site (`style-src`, `img-src`); toast and degraded notice icons.
- Commits: 2dff18c (generator, bundle, inline asset mode, tests), decbbef (content script, manifest, tests), bb91067 (README); this document in the following docs commit.

T8 must review (found in T6):
- Manifest `name`/`description`, CSP, `minimum_chrome_version` (native `<dialog closedby>` is progressive; `showModal()` needs no minimum, `chrome.storage.session` needs 102).
- Host access: `content_scripts.matches` is `http://*/*`, `https://*/*`; decide whether `host_permissions` is needed (the worker only uses `tabs`) and justify the broad match for the store listing.
- `web_accessible_resources` exposes stylesheets, logo and icons to every http/https page (pages can fingerprint the extension); consider `use_dynamic_url`. Resolved in T11: the manifest no longer declares it.
- In real Chrome verify that a strict page CSP (`style-src`) does not block the extension `<link>` inside the shadow root; if it does, fall back to a `content_scripts.css` entry or a constructed stylesheet.
- `@font-face` does not apply inside a shadow root, so the modal uses the system sans-serif font on real pages; load Inter in the page document or accept the fallback.
- SPA navigation (`pushState`) is not seen by the worker (`tabs.onUpdated` only reports loading/complete), so a client-side route change is not re-evaluated.
- README "Notas técnicas" still says the prototype has no service worker and lists only `storage` and `tabs`.
- The demo overlay keeps the div markup but now has inert background, focus trap, focus return and Esc (T7); it is still not a native `<dialog>`.
- Not exercised in real Chrome or with a screen reader (T7): focus restoration after redraws, `inert`, `display: contents` on the tab panel, tab and menu keyboard behaviour, the skip link and the focus ring must be checked by hand.

## Final acceptance summary

| Criterion | Status |
|---|---|
| Changing `provider` and `baseUrl` in one config file is the only code step to use a backend | Met with caveat: the manifest `host_permissions` entry is a second, non-code edit unless the backend answers CORS (guarded by a test) |
| Swap touches at most 2 files (`config.js` and the remote adapter); UI, containers, domains, use cases never change | Met with caveat: true for `config.js` + `remote.js` (only if the API differs), but the realistic count is `config.js` + `manifest.json` (+ `remote.js`). UI, containers, domains and use cases are proven untouched by `tests/provider-switch.test.js` |
| Architecture test enforces that only `platform/providers/` touches the network and adapters; one composition root | Met (`tests/architecture.test.js`, now also the config reader and the backend address) |
| Real navigation on http/https pages produces a verdict, badge and in-page modal using the mock | Met at fake-DOM and fake-chrome level; not verified in real Chrome |
| Timeout, offline and cache-down show a degraded state; nothing throws | Met in tests for verdict, data, worker and UI; HU-26 popup lacks the cause (open item); not verified in real Chrome |
| `node --test` is green; README documents the provider contract | Met (331 pass); README has the contract, ports, touch points and a manual checklist |
| Accessibility baseline (T7) | Met at string and fake-DOM level; keyboard, focus and screen reader not verified in real Chrome |

## Open items

- `protectionReason`: the popup cannot show why protection is degraded (needs `navigation-service.js`, the state shape and `popup-page.js`).
- Real Chrome pass (README checklist): badge on a real tab, modal on a real page, strict page CSP, SPA navigation, focus and `inert`, service worker restart, fonts inside the shadow root, screen reader.
- Real backend: cookie attributes (`Secure; SameSite=None`), CORS versus `host_permissions`, any difference from the documented REST contract.
- T7 leftovers: login/register "sending" state, unknown history id message, back-arrow read by screen readers, `display`-toggled toasts, uncovered CSS colours.
- Chrome Web Store packaging (not requested): `CHROMEWEBSTORE.md`, privacy policy URL, screenshots, zip excluding `tests/`, `odd/`, `README.md`.

## Next step

Feature complete locally on `feat/front-backend-ready` (not pushed). Load the folder unpacked and walk the README "Verificación manual en Chrome" checklist; then decide the delivery strategy (the branch is well over 400 authored lines: ask-on-risk asks for `stacked-to-main` or `feature-branch-chain`).

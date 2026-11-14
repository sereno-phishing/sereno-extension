# QA findings: policy on reload, truthful verdict copy, backend pages

Branch: `fix/qa-findings` (from `main` at `ccad1bc`). Delivery strategy: `single-pr`
(forecast under 400 authored lines of source; tests excluded from the estimate).

## Objective

Fix the three defects a manual QA session in real Chrome found, one work unit
and one commit each, tests first.

## Findings and required behaviour

### F1. A policy change does not reach a tab that reloads the same URL

A tab showed the yellow warning; the administrator set the domain to "bloqueo";
reloading the same URL in the same tab kept the yellow warning.

- A reload (any new navigation commit) of an evaluated URL asks the backend
  again, so the policy in force applies.
- The several events of one navigation (`tabs.onUpdated` loading/complete,
  `onActivated`) still cause one request and one overlay render.
- "Continuar bajo riesgo" stays remembered per tab and origin, but it only
  suppresses a warning: a block is always shown.
- A tab left open without reloading does not update by itself.

### F2. The warning explains a reason the product does not know

The overlay always said the domain imitates a known payment site. The backend
returns only class, score, policy and source. Every sentence that explains a
verdict must be supported by that data, in Spanish and English.

### F3. The extension evaluates the backend's own pages

Pages whose origin is the configured backend origin are never evaluated: no
`/v1/verdict` request, no overlay, no badge, no history entry. Origins are
compared (scheme, host, port). Loopback and private addresses in general are
not exempt.

## Work units

- [x] T1 `fix(protection)`: apply the current domain policy when a tab reloads.
      Route: inline (single writer). Files: `protection/application/navigation-service.js`,
      tests.
- [x] T2 `fix(verdict)`: explain a verdict only with data the extension has.
      Files: `verdict/ui/verdict-modal.js`, tests, generated assets if needed.
- [x] T3 `fix(protection)`: never evaluate the backend's own pages.
      Files: `platform/providers/*`, `protection/application/navigation-service.js`, tests.

## Checks

- `node --test` from the repository root: 0 failures, 0 skipped (464 pass on the base).
- `rg -n -i "imita|sitio de pagos|payment site" .` outside `odd/`: no hits, or each justified.
- `node tools/build-content-assets.js` leaves no diff after the final commit.

## Evidence

### T1 (commit `2725226`)

- Cause: `handleNavigation` returned the stored outcome whenever the tab record
  had the same url (base `protection/application/navigation-service.js:190-194`),
  and `fromTabUpdate` dropped the "loading" event of a reload because it carries
  no url, so only "complete" arrived and it hit that branch.
- Fix: a "loading" event is a new navigation (`fresh`) and is evaluated again;
  "complete" and activation reuse the stored outcome. The record is marked
  `navigating` from the first "loading" until "complete" (at most 10 s), so a
  second "loading" of the same navigation is a repeat. A pre-commit "loading"
  whose `tab.pendingUrl` differs from `tab.url` is skipped.
- RED: `node --test tests/navigation-reload.test.js`: 9 tests, 2 pass, 7 fail
  (requests 1 instead of 2, status still "advertencia").
- GREEN: same command: 9 pass. `node --test`: 473 tests, 473 pass, 0 fail, 0 skipped.
- Not verified in real Chrome: the exact `tabs.onUpdated` sequence of a reload.

### T2 (commit `f9d84fe`)

- Cause: the explanation paragraph of the verdict dialog was fixed demo copy
  (`verdict/ui/verdict-modal.js:20,29,36,38` on the base): the warning named a
  reason and the block claimed that no data had been sent. Nothing computes either.
- Fix: both paragraphs now state the class and the policy only, in Spanish and
  English. Title, risk level, score, date and source were already data driven.
  No other verdict explanation exists (popup site card and history detail show
  status, risk, score, date and source only); no element was removed.
- `content/content-assets.generated.js` has no copy in it (styles and icons):
  `node tools/build-content-assets.js --check` reports it up to date.
- RED: `node --test tests/verdict-copy.test.js`: 2 tests, 0 pass, 2 fail.
- GREEN: same command: 2 pass. `node --test`: 475 tests, 475 pass, 0 fail, 0 skipped.
- Left as is, reported: the pending toast line "Reintentando automáticamente..."
  (`verdict/ui/page-overlay.js`) is not a verdict explanation, but nothing retries.

### T3 (the commit that adds this section)

- Cause: `isEvaluable` accepts every http(s) url
  (`protection/application/navigation-service.js`), so a page served by the
  backend was sent to `/v1/verdict` like any site and the model scores IP hosts
  as phishing.
- Fix: the verdict port gains `isOwnPage(url)` (`platform/providers/remote.js`),
  a synchronous predicate that compares the url origin with the origin of
  `baseUrl`; the composition root stays the only reader of the config. The
  navigation use case asks it before anything else: no request, no tab message,
  badge cleared, the previous outcome of the tab dropped (continued origins
  kept) and, for the active tab, `currentSite: null`.
- Popup state: there was no state for pages Sereno does not evaluate. Pages that
  are not http(s) (`chrome://`) are ignored and the popup keeps the last
  evaluated site. Backend pages use the existing idle card ("Aún no hay un sitio
  evaluado."). `chrome://` pages were left as they are.
- RED: `node --test tests/backend-pages.test.js tests/service-worker.test.js`:
  20 tests, 11 pass, 9 fail. One of the nine ("another port ... is evaluated")
  failed because of an invalid url in the test data, not because of the missing
  behaviour; it is a guard that also passes without the fix.
- GREEN: same command: 20 pass. `node --test`: 485 tests, 485 pass, 0 fail, 0 skipped.

## Final checks

- `node --test`: 485 tests, 485 pass, 0 fail, 0 skipped.
- `rg -n -i "imita|sitio de pagos|payment site" .` outside `odd/`: no hits.
- `node tools/build-content-assets.js`: no diff.

## Next step

Owner: reload the extension in Chrome and repeat the QA session (policy change
plus reload, overlay copy in both languages, a backend page). Push and pull
request are the owner's decision.

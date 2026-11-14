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
- [ ] T2 `fix(verdict)`: explain a verdict only with data the extension has.
      Files: `verdict/ui/verdict-modal.js`, tests, generated assets if needed.
- [ ] T3 `fix(protection)`: never evaluate the backend's own pages.
      Files: `platform/providers/*`, `protection/application/navigation-service.js`, tests.

## Checks

- `node --test` from the repository root: 0 failures, 0 skipped (464 pass on the base).
- `rg -n -i "imita|sitio de pagos|payment site" .` outside `odd/`: no hits, or each justified.
- `node tools/build-content-assets.js` leaves no diff after the final commit.

## Evidence

### T1

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

## Next step

T2.

# Remove the mock stage

## Objective

The extension runs only against the real backend. Remove the mock provider, the
seed data, the demo store page and every helper, setting, style, comment and
README text that existed only for them, leaving nothing unused.

## Decision

Owner decision, 2026-11-13: the product needs the local backend running; there
is no offline mode. Runtime behaviour against the backend does not change,
except for one intended fix: the popup no longer shows a made-up current site
before the first real navigation.

## Scope

- In: `platform/providers/mock.js`, `platform/seed.js`, the provider axes, the
  demo store page and scenarios, demo-only parts of the verdict modal, helpers
  only the mock or the demo page called, the legacy-credential cleanup of the
  account use cases, mock-era comments, README sections, tests of removed code.
- Moved: `demo-store/ui/verdict-modal.js` to `verdict/ui/verdict-modal.js`.
- Out: `tests/verdict-local-http.test.js`, `tests/auth-local-http.test.js` and
  `tests/admin-local-http.test.js` (they spawn the sibling backend, which is
  changing in parallel), `assets/`, `icons/`, the sibling `sereno-backend`
  repository.

## Work units

Route for all: delegated direct, one bounded writer (more than two non-trivial
files per unit).

- [x] T1 Test-only REST fake (`tests/rest-fake.js`) and fixtures
  (`tests/fixtures.js`); adapter, use case and view tests re-pointed off the
  mock and the seed. Commit 23aa002.
- [x] T2 Remove the mock provider, the provider axes, the demo store page and
  its scenarios, and the helpers only they used. Commit 717c5dc.
- [x] T3 Default state without a made-up current site, test first; seed data
  deleted. Commit 3aa85b3.
- [x] T4 Verdict modal moved next to its caller; demo shell and fixed score
  widths removed; content assets rebuilt. Commit ca58b99.
- [x] T5 README describes the backend-only product. Commit: the one that
  contains this line.

## Decisions taken while working

- With one adapter the `provider`, `authProvider` and `policyProvider` axes
  select nothing: removed. `Sereno.providers.config` keeps `baseUrl` and
  `timeoutMs`; `Sereno.services` is the remote adapter (`verdict`, `auth`,
  `data`, `survey`), without the former `provider` key and `auth.remote` flag.
- The demo store page was removed together with the mock provider (not in a
  separate unit): the page loaded `mock.js` and the mock read the scenarios.
- `history.append`, the dedupe window and the capacity stay as internals of
  `history.normalize`, which the history use case applies to what the backend
  returns; only their exports and `createRecord`/`entriesOf` were removed.
- Also removed because only the demo page called them:
  `protection.evaluatingSite`, `protectionService.showSite`,
  `browser.setTabBadge`, the `ui.delegateClicks` export.
- The REST fake follows the contract strictly (401 without a session, 403 for a
  user on administrator-only routes), so the re-pointed tests sign in first and
  two tests assert those refusals.

## Checks and evidence

- T3 test first: `tests/state-store.test.js` ("a new installation opens with no
  session, no current site and no model version seen") and
  `tests/popup-site-card.test.js` ("before the first navigation the site card
  names no site and reads as pending") failed before the change (the store had
  no `DEFAULT_STATE`; the fresh popup rendered `tienda-servicios.pe`) and pass
  after it.
- `node --test` at the end: 463 tests, 460 pass, 3 fail. The three failures are
  the local HTTP tests that spawn the sibling backend; they also fail on the
  untouched base tree (894b030) since the backend changed during this work:
  `admin-local-http.test.js:74` and `auth-local-http.test.js:79`
  (`registered.ok` is false), `verdict-local-http.test.js:107` (`source` is
  `cache`, expected `modelo`). The base run at the start of the work was
  523/523.
- `rg -n -i "mock|seed|demo"` outside `tests/`, `odd/` and `README.md`: no hits.
- `node tools/build-content-assets.js` leaves no diff.
- `git ls-files | wc -l`: 154 before, 148 after.
- Referenced files exist: `tests/manifest.test.js` ("every file the manifest,
  the pages and the service worker load is a real file"), checked by mutation.
- Not verified: real Chrome behaviour (popup before the first navigation, page
  dialog after the stylesheet trim).

## Open questions

- Before the first navigation the popup reuses the pending site card: label
  "Este sitio", no domain, "Evaluando…" pill, announced as busy. It is an
  existing state, not a new one, but it says "evaluating" while nothing is
  being evaluated. A dedicated empty state would be new UI and was not built.
- `platform/storage.js` (localStorage branch) and `browser.openPage`
  (`window.open` branch) still support pages opened outside the extension; they
  were not in the inventory and were left.

## Next step

Re-point the three `*-local-http.test.js` files once the backend change lands.

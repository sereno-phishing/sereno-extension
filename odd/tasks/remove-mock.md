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
  demo store page and scenarios, demo-only parts of the verdict modal, domain
  helpers only the mock called, the legacy-credential cleanup of the account
  use cases, mock-era comments, README sections, tests of removed code.
- Moved: `demo-store/ui/verdict-modal.js` to `verdict/ui/verdict-modal.js`.
- Out: `tests/verdict-local-http.test.js` and `tests/auth-local-http.test.js`
  (they spawn the sibling backend, which is changing in parallel), `assets/`,
  `icons/`, the sibling `sereno-backend` repository.

## Work units

- T1 Default state without a made-up current site (test first). Route: one
  bounded writer for the whole feature.
- T2 Test-only REST fake and fixtures; tests re-pointed off the mock and seed.
- T3 Remove the mock provider, the seed data, the provider axes and the helpers
  only the mock used.
- T4 Remove the demo store; move the verdict modal next to its only caller.
- T5 README describes the backend-only product.

## Checks

- `node --test` after every work unit.
- `rg -n -i "mock|seed|demo"` outside `tests/`, `odd/` and `README.md` returns
  nothing or only justified hits.
- `node tools/build-content-assets.js` leaves no diff.
- Every script referenced by `manifest.json`, the HTML pages and
  `importScripts` exists.

## Evidence

(filled in per work unit)

## Next step

T1.

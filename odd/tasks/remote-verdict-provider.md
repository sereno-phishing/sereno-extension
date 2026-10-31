# Remote verdict provider

## Objective and authorization
Serve verdicts, history, cache, metrics and model version from the sibling backend instead of the mock, now that `sereno-backend` (branch `feat/verdict-pipeline-stub`) implements every route of the README "Contrato REST" with a `FakeClassifier`. The backend side is tracked in `../sereno-backend/odd/tasks/verdict-pipeline-stub.md` (T1-T4); this document tracks the extension side (T5). The backend repository is read-only for this task. No push, PR or merge authorized.

## Scope and constraints
- Allowed edit surfaces: `platform/providers/**`, `history/**`, `administration/**`, `account/**`, `tests/**`, `README.md`, this document.
- Classic scripts on the `Sereno` namespace; no `fetch(` outside the remote adapter (`tests/architecture.test.js`).
- The offline demo (all providers `"mock"`) must keep working.
- Local HTTP tests use an ephemeral loopback port and temporary JSON files; never `data/*.json`.

## Delivery
Feature branch `feat/remote-verdict-provider`. One work-unit commit for T5. RDD: not started by this bounded writer; ordinary functional verification applies.

## Tasks
- [x] T5: Switch `config.provider` to `"remote"`, align the remote adapter and history use case with the real backend, add a real loopback verdict/data test, keep the provider-switch test meaningful and update the README. Route: delegated direct (multi-file write trigger).

## Acceptance
- `node --test` passes with the new local HTTP test running (not skipped).
- Non-admin cache/metrics calls surface `forbidden`; signed-out history reads as an empty list, as with the mock.
- README no longer says verdicts/history/cache/metrics are mock or that `provider: "remote"` must not be set.

## Decisions
- Signed-out history (backend 401 `invalid`) is handled in `history/application/history-service.js`, not in the adapter: the adapter maps transport faithfully, the use case owns the rule "no session, no history" (empty list, nothing to clear), matching the previous mock behavior. The popup already skips the call without a local session; the 401 only appears when the local session outlived the backend one.
- `forbidden` is accepted from every administrator-only route (policies, cache, metrics); its message became section-neutral ("Solo una cuenta de administrador puede acceder a esta sección.").
- The admin cache/metrics notes no longer claim the data is simulated or not from the backend.
- The service worker test now answers its default-config verdict requests from a fake backend, because the shipped config is remote.

## Evidence (2026-10-31)
- RED: `node --test tests/providers.test.js tests/auth-remote-composition.test.js tests/data-services.test.js` -> 62 pass, 8 fail (default config, cache/metrics `forbidden`, signed-out history, forbidden message, admin notes).
- RED: `node --test tests/provider-switch.test.js` -> 17 pass, 2 fail (signed-out history swap, administrator gate).
- RED: `tests/verdict-local-http.test.js` against the previous `remote.js` -> fails with `actual: { ok: false, error: 'server' }`, expected `forbidden`.
- GREEN: `node --test` -> 514 tests, 514 pass, 0 fail, 0 skipped (the real loopback verdict test ran).
- `git diff --check` -> exit 0.

## Next step
Manual check in real Chrome with the backend running: verdict badge/modal from the `FakeClassifier`, cache hit on the second visit, popup history list/clear, admin cache and metrics, degraded protection with the backend stopped. Replace the `FakeClassifier` with the ML model in the backend when it exists.

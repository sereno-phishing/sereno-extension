# Policy applied by the extension

## Objective
Consume the two-class verdict of the backend and apply the per-domain response policy in the extension (RF-10), keeping the warn / block / safe behaviour the user already sees.

## Problem and rationale
The backend now answers the model class (`phishing` / `legitima`) plus the domain policy instead of a three-state `status` (see `sereno-backend/odd/tasks/real-model-classifier.md`). The ADD assigns the policy to the extension's interface manager; today no code applies it. Closes I-49.

## Decision
Policy is applied by the extension, in one place (Andrés, 2026-11-13).

## REST contract consumed
- `POST /v1/verdict` -> `{domain, verdict, policy, score, source, latencyMs}`; `verdict` is `"phishing"` or `"legitima"`; `policy` is `"advertencia"` or `"bloqueo"`, always present.
- History items: `verdict` and `policy` instead of `status`.
- Cache entries (`GET /v1/cache`): `verdict` instead of `status`; several entries may share a domain.
- `GET /v1/metrics` unchanged. `GET /v1/model` reports `2.0.0`.

## Mapping rule
`legitima` -> `seguro`; `phishing` -> the policy (`advertencia` or `bloqueo`). Any other value is a server error, as today.

## Authorized scope
- sereno-extension only: verdict domain, providers (remote and mock), history and administration views that read `status` from the backend, tests, README contract table, this file.
- No backend change, no academic documents, no new UI.

## Constraints
English technical artifacts. Test first (`node --test`), RED before GREEN. Conventional commits, no AI attribution. The mock adapter must emit the same shape as the backend.

## Work units
- [x] T1 Apply the policy when reading a verdict, a history item and a cache entry; mock adapter and README contract aligned. Route: delegated (multi-file write).
- [ ] T2 Manual check in Chrome against the local backend (Andrés).

## Checks
The repository test command in its README (509 tests passed before this work).

## Progress and evidence
Branch `feat/policy-applied-verdict` from `026c48a`.

T1 done (route: delegated, one writer). Commit `25b4082`.
- Rule in one place: `Sereno.verdict.applyPolicy(verdict, policy)` in `verdict/domain/verdict.js`. Used by `verdictOutcome.fromResult` (verdict) and `history.toEntry` (history item, called by `historyService.list`). Everything past those two boundaries still works on `seguro` / `advertencia` / `bloqueo`.
- A history record outside the contract is left out of the list (same treatment malformed records already had); an off-contract verdict degrades as `server`.
- Cache entries have no policy, so no status: `verdictCache.statusText` shows the model class (`Reevaluado: phishing` / `Reevaluado: legítimo`) or the pending text when `verdict` is null; the table is not keyed by domain.
- Mock adapter and seed emit the backend shape (`verdict` + `policy`, cache `verdict`, model `2.0.0`); README "Contrato REST", `ports.js` and `remote.js` updated.
- RED: 11 failing after the verdict-domain tests, 48 failing with the whole test set written, before any implementation. GREEN: `node --test` = 523 tests, 522 pass, 1 fail.
- The one failure is environmental: `tests/verdict-local-http.test.js` ("remote verdicts, history, cache, metrics and model version run against the real backend") now asserts this contract and the sibling backend still serves the old one on its own branch (first mismatch: `GET /v1/model` answers `1.3`). Re-run once `feat/real-model-classifier` lands.
- Baseline on this branch was 514 passing, not 509.

Open points to reconcile with the backend when it lands:
- The contract does not spell the cache entry while a re-evaluation is pending. The extension reads `verdict: null` (or absent) as pending, a model class as re-evaluated, and shows any other text as it came.
- The local HTTP test passes `'CLASSIFIER': 'fake'` to `create_app` and expects `tienda-servicios.pe` legitimate and the two phishing demo domains phishing from that stand-in, with the block policy set through `PUT /v1/domains`.
- A mock state stored by an older build keeps history records with `status`; they are left out of the list until the history is cleared.

Parent check (2026-11-13): `node --test` 523 passed against `sereno-backend` at `935f984`. `tests/verdict-local-http.test.js` now expects version `1.3`, the one the backend stand-in classifier reports.

## Next step
T2: manual check in Chrome against the local backend (Andrés), after the backend branch serves the contract; then re-run `node --test` to confirm `tests/verdict-local-http.test.js`.

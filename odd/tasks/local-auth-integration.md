# Local authentication integration

## Objective and authorization
Connect extension registration, login, session restoration and logout to the existing local JSON-backed backend, as requested by the user. Keep verdicts, history, metrics and other data mocked. No remote execution, publishing, or real user data.

## Scope and constraints
Use http://127.0.0.1:5000 for local development. Explicit development-only HTTP cookie configuration must preserve secure defaults and reject non-loopback use. Retain the repository boundary and JSON persistence. Do not add credentialed wildcard CORS. Do not read runtime data/db.json. English technical artifacts; preserve existing UI language.

## Delivery
Feature branches: feat/local-auth-integration in both repositories. Strategy: exception-ok; the user explicitly selected one coherent delivery after seeing the 589-line total, with one behavior commit per repository. Initial forecast: approximately 300-390 authored lines; actual: 589, generated files and this task document excluded. No push, PR, or merge authorized. RDD: off by global preference; ordinary functional verification applies.

## Tasks
- [x] T1: Implement opt-in loopback HTTP authentication cookies with secure defaults, tests, and local startup documentation in sereno-backend. Route: delegated direct; preparation and multi-file write triggers. Commit: 8995078.
- [x] T2: Compose remote authentication with mock data/verdict providers, configure exact loopback permissions, add deterministic contract tests and startup instructions in sereno-extension. Route: delegated direct; preparation and multi-file write triggers. Commit: 27cf1a3.

## Acceptance and verification
Strict TDD from global configuration: observe failing tests before behavior changes, then passing tests. Backend: .venv/Scripts/python.exe -m pytest -q and .venv/Scripts/python.exe -m compileall -q app. Extension: node --test. Add an isolated integration check against a real local backend using temporary data, not runtime accounts. Independent verification is required if native assessment is high or unavailable. Real Chrome cookie behavior must be reported as unverified unless actually tested. Parent reruns one reported command.

## Progress
T1 and T2 implementations, tests, and both startup READMEs are committed locally. The user authorized adding `sereno-extension/tests/provider-switch.test.js`; its fixtures now explicitly select both provider axes and expect the new config key. Independent verification found no material candidate-caused defects. Real Chrome verification remains pending.

Local HTTP uses explicit `AUTH_LOCAL_HTTP=1`, HttpOnly/Lax cookies, literal loopback host and peer checks, and rejection of forwarded headers. Production Secure/None defaults remain unchanged. Extension authentication has its own provider axis; verdict/data remain mock. Account use cases purge legacy mock credentials/sessions for remote auth and adopt the server-confirmed identity instead of retaining stale local identity.

## Evidence and next step
Observed foreground checks (2026-10-27):
- Backend RED: `.venv/Scripts/python.exe -m pytest -q tests/test_local_http_auth.py` -> 31 failed, 1 passed before implementation.
- Backend GREEN: `.venv/Scripts/python.exe -m pytest -q` -> 117 passed; `.venv/Scripts/python.exe -m compileall -q app` -> exit 0.
- Extension RED: `node --test tests/auth-remote-composition.test.js` -> 8 failed before implementation.
- Extension focused GREEN: `node --test tests/auth-remote-composition.test.js tests/manifest.test.js` -> 21 passed.
- Initial extension full check: `node --test` -> 375 passed, 5 failed, 0 skipped, exposing the provider-switch fixture assumptions. After the authorized fixture update and README reconciliation, the rerun returned 380 passed, 0 failed, 0 skipped.
- Final backend reruns: `.venv/Scripts/python.exe -m pytest -q` -> 117 passed; `.venv/Scripts/python.exe -m compileall -q app` -> exit 0.
- The real loopback HTTP integration test passed within the final full extension run, using the actual remote adapter, isolated temporary JSON, an ephemeral loopback server, and cleanup. It covers registration, duplicate registration, login, invalid credentials, restoration, logout, revocation, and password nonretention. This supplies a Node cookie jar, not Chrome cookie-policy verification.
- `git diff --check` returned exit 0 in each repository. Authored counts include untracked source tests and exclude this parent-owned task document: backend +125/-7 = 132 changed lines; extension +341/-116 = 457 changed lines; combined 589. No generated assets changed.

Resolved scope blocker: the user selected `Autorizar actualización` for `sereno-extension/tests/provider-switch.test.js`. Updating this exact test path removed inherited remote auth from mock fixtures and adjusted the expected config keys/differences. The earlier RED evidence is retained; no new RED run is claimed for this fixture correction.

Independent verifier reran backend pytest (117 passed), extension node --test (380 passed), and both diff checks (exit 0). Parent reran backend compileall (exit 0). Native assessments returned high/unassessable because of untracked candidate files; the high-tier independent verification path was applied, without starting RDD. No native approval is claimed. Real Chrome behavior remains unverified. Official Chrome network/cookie/match-pattern and Flask cookie/proxy documentation were consulted; the modern-web-guidance install/network runner was not executed under the no-install constraint. No remote operations or installations occurred.

Rollback boundaries: backend commit 8995078 contains T1; extension commit 27cf1a3 contains T2. Revert each complete work unit rather than splitting production behavior from its tests. Next: start the backend with AUTH_LOCAL_HTTP=1 using the README command, reload the unpacked extension, and manually check registration, login, popup restoration and logout in Chrome. Offline local logout cannot guarantee server revocation. No server was left running by tests.

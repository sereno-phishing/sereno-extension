# Azure backend

## Objective and authorization
Point the extension at the deployed backend `https://sereno-phishing.chilecentral.cloudapp.azure.com` (Caddy + Let's Encrypt in front of Flask; production cookies are `Secure; HttpOnly; SameSite=None`) while keeping local development one edit away. Decisions taken by the parent: default `baseUrl` becomes the Azure origin; `host_permissions` lists both the Azure origin and `http://127.0.0.1:5000/*`; manifest `version` goes from 0.2.0 to 0.3.0; the README says to drop the loopback entry before a Chrome Web Store submission. No push, PR or merge authorized.

## Scope and constraints
- Allowed edit surfaces: `platform/providers/config.js`, `manifest.json`, `README.md`, `tests/**`, this document.
- `config.js` stays the only file holding the backend address (`tests/architecture.test.js`).
- Integration tests that start the sibling backend on loopback keep their explicit loopback `baseUrl`.
- README and UI copy keep Spanish; code and tests in English.

## Delivery
Feature branch `feat/azure-backend`. One work-unit commit for T1. RDD: not started by this bounded writer; ordinary functional verification applies.

## Tasks
- [x] T1: Switch the default `baseUrl` and manifest `host_permissions`/`version`, update the composition, provider and manifest tests to express the new expectation (RED, then GREEN), and update the README (production backend, how to switch to local, drop loopback before store submission). Route: delegated direct (multi-file write trigger).

## Acceptance
- `node --test` has no new failures compared with `main` (baseline 2026-11-22: 512 tests, 509 pass, 0 fail, 3 skipped because Docker was not running).
- The manifest test accepts exactly the configured HTTPS origin plus the loopback development origin, and rejects HTTP for anything else.
- README no longer presents the loopback backend as the only one.

## Decisions
- The manifest test now pins `host_permissions` to exactly the production origin plus the loopback origin, and separately checks that the configured `baseUrl` is HTTPS (or the exact loopback setup) and is granted. Switching `baseUrl` to loopback keeps the manifest test green; the provider and composition tests pin the shipped default to the production origin.
- Service-worker tests already read `Sereno.providers.config.baseUrl`, so they follow the new default without edits. Loopback integration tests keep their explicit `baseUrl`.
- No `connect-src` restriction exists (CSP is `script-src 'self'; object-src 'self'`), so nothing blocks the new origin.
- Cookies: Chrome docs (storage-and-cookies) say host-permitted extension requests are treated as same-site, but that treatment "does not apply if third-party cookies are blocked". With third-party cookies allowed, the `SameSite=None; Secure` session cookie should travel; with them blocked (Incognito default or user setting) the session may not persist. Not a code blocker; documented in the README and left for manual Chrome verification.

## Evidence (2026-11-22)
- Baseline on `main`: `node --test` -> 512 tests, 509 pass, 0 fail, 3 skipped (loopback backend tests; PostgreSQL/Redis not running).
- RED: `node --test tests/providers.test.js tests/auth-remote-composition.test.js tests/manifest.test.js` -> 37 tests, 34 pass, 3 fail (default config in providers and composition tests, manifest host_permissions).
- GREEN: `node --test` -> 513 tests, 510 pass, 0 fail, 3 skipped (same three loopback backend tests as the baseline).
- `git diff --check` -> exit 0.
- Commit: `d4979cb` (feat(providers): point the extension at the published Azure backend).
- `curl -sS -i https://sereno-phishing.chilecentral.cloudapp.azure.com/v1/model` -> `200 OK`, `{"version":"3.0.0"}`, served via Caddy with HSTS.

## Next step
Manual check in real Chrome against the published backend: register, close/reopen the popup, log out and log in (session cookie persistence), a verdict on a navigation, history list/clear. Repeat once with third-party cookies blocked to observe the session behavior. Before a Chrome Web Store submission, drop `http://127.0.0.1:5000/*` from `host_permissions` and the manifest test.

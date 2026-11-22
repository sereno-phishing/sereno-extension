# Privacy policy data

## Objective and authorization
Complete the in-popup privacy policy with the data the owner decided on 2026-11-22: data controllers (Andrés Torres García and Sebastián Lobato Pozo, authors of the project), contact (`u202220528@upc.edu.pe`), third parties (Microsoft Azure as hosting/infrastructure provider only; data is not sold or shared with anyone else) and retention (kept while the service is active and needed for phishing detection; deletion on request by email; cached verdicts expire automatically, by default 7 days for phishing and 24 hours for legitimate). No push, PR or merge authorized.

## Scope and constraints
- Allowed edit surfaces: `privacy/ui/privacy-views.js`, `tests/**`, `README.md`, this document.
- The wording must match the public page `sereno-landing/privacy.html` (same rows, same text, both languages).
- Retention wording names no fixed term and does not mention the thesis or the service stopping.
- No CSS change: the new rows reuse the existing `privacy-row` markup.

## Delivery
Feature branch `feat/privacy-policy-data`, stacked on `feat/azure-backend` (the policy names the Azure backend). One work-unit commit. RDD: not started by this bounded writer; ordinary functional verification applies.

## Tasks
- [x] T1: Verify the policy against `sereno-backend` (read-only), update the privacy view test (RED), add the hosting, retention and controller/contact rows and fix the account/rights wording (GREEN). Route: delegated direct (writer for the two repositories).

## Facts verified in sereno-backend (branch `feat/url-hash`, read-only)
- `app/storage/schema.sql`: `url_evaluada` keeps `hash_url` (SHA-256 of the normalized URL) and `dominio`; no table stores a URL. Redis cache entries live under the URL hash.
- `consulta.id_usuario` references `usuario` and is NULL for anonymous queries; `app/history/postgres_repository.py` clears a history with `UPDATE consulta SET id_usuario = NULL`, so the rows remain, unlinked.
- `usuario` has `nombre` and `hash_contrasena` only (no email).
- `app/cache/domain.py`: `DEFAULT_TTL_PHISHING_DAYS = 7`, `DEFAULT_TTL_LEGIT_HOURS = 24` (administrators can change them).
- Account deletion exists only as an administrator route (`DELETE /api/users/<username>`), hence deletion by email request.
- Extension side: `platform/providers/config.js` and `manifest.json` point to `https://sereno-phishing.chilecentral.cloudapp.azure.com`.

## Changes to the previous wording
- "Tu cuenta" did not say that queries are linked to the account; it now does, and says anonymous queries are not linked to anyone.
- "Tus derechos" said the history could be deleted, which read as erasing the records; the backend only unlinks them from the account. It now says so and adds deletion by email.
- New rows: "Dónde se alojan" (Azure), "Cuánto tiempo los guardamos" (retention and cache expiry), "Responsables" (controllers and contact).

## Acceptance
- The privacy view renders seven rows in Spanish and English, with the contact email twice, Microsoft Azure and both controllers.
- `node --test` has no new failures compared with the branch base.

## Evidence (2026-11-22)
- Baseline on `feat/azure-backend`: `node --test` -> 513 tests, 510 pass, 0 fail, 3 skipped (loopback backend tests).
- RED: `node --test tests/privacy-views.test.js` -> 4 tests, 0 pass, 4 fail.
- GREEN: `node --test tests/privacy-views.test.js` -> 4 tests, 4 pass, 0 fail; full `node --test` -> 514 tests, 511 pass, 0 fail, 3 skipped (same three).
- `git diff --check` -> exit 0; no placeholders (`TBD`, `[correo]`, `TODO`) in the changed files.
- Commit: the work-unit commit that adds this document (`docs(privacy): add controller, contact, hosting and retention`).

## Next step
Check the popup in real Chrome (seven rows fit and scroll). The policy has no "last updated" date or change-notice section; add them if the owner decides on that wording.

# Privacy policy data

## Objective and authorization
Complete the in-popup privacy policy with the data the owner decided on 2026-11-22: data controllers (Andrés Torres García and Sebastián Lobato Pozo, authors of the project), contact (`u202220528@upc.edu.pe`), third parties (Microsoft Azure as hosting/infrastructure provider only; data is not sold or shared with anyone else) and retention (kept while the service is active and needed for phishing detection; deletion on request by email; cached verdicts expire automatically, by default 7 days for phishing and 24 hours for legitimate). No push, PR or merge authorized.

Follow-up the same day (T2): for Chrome Web Store completeness, disclose the anonymous SUS survey exactly as the code behaves, and add the last-updated date (22 November 2026) with a sentence saying changes are published there with a new date.

## Scope and constraints
- Allowed edit surfaces: `privacy/ui/privacy-views.js`, `tests/**`, `README.md`, this document.
- The wording must match the public page `sereno-landing/privacy.html` (same rows, same text, both languages).
- Retention wording names no fixed term and does not mention the thesis or the service stopping.
- No CSS change: the new rows reuse the existing `privacy-row` markup.

## Delivery
Feature branch `feat/privacy-policy-data`, stacked on `feat/azure-backend` (the policy names the Azure backend). One work-unit commit per task. RDD: not started by this bounded writer; ordinary functional verification applies.

## Tasks
- [x] T1: Verify the policy against `sereno-backend` (read-only), update the privacy view test (RED), add the hosting, retention and controller/contact rows and fix the account/rights wording (GREEN). Route: delegated direct (writer for the two repositories).
- [x] T2: Verify the SUS survey in the extension and backend (read-only), extend the privacy view test (RED), add the "Encuesta de opinión" and "Cambios en esta política" rows (GREEN). Route: delegated direct.

## Facts verified in sereno-backend (branch `feat/url-hash`, read-only)
- `app/storage/schema.sql`: `url_evaluada` keeps `hash_url` (SHA-256 of the normalized URL) and `dominio`; no table stores a URL. Redis cache entries live under the URL hash.
- `consulta.id_usuario` references `usuario` and is NULL for anonymous queries; `app/history/postgres_repository.py` clears a history with `UPDATE consulta SET id_usuario = NULL`, so the rows remain, unlinked.
- `usuario` has `nombre` and `hash_contrasena` only (no email).
- `app/cache/domain.py`: `DEFAULT_TTL_PHISHING_DAYS = 7`, `DEFAULT_TTL_LEGIT_HOURS = 24` (administrators can change them).
- Account deletion exists only as an administrator route (`DELETE /api/users/<username>`), hence deletion by email request.
- Extension side: `platform/providers/config.js` and `manifest.json` point to `https://sereno-phishing.chilecentral.cloudapp.azure.com`.

## SUS survey facts (verified read-only, 2026-11-22)
- Extension: the account menu shows "Encuesta de opinión" only with a session and while the backend reports it as not submitted (`app/popup/popup-views.js`, `showSurvey`); drafts are kept per username in `chrome.storage.local` (`survey/application/survey-service.js`, `platform/storage.js`); the survey screen already says answers do not include the username.
- Backend: `POST /v1/survey` requires a session and exactly 10 integer answers from 1 to 5 (`app/survey/domain.py`). `encuesta_respuesta` stores the answers and the UTC submission date; `encuesta_participante` stores only `id_usuario`. The two tables share no column (`app/survey/postgres_repository.py`, `app/storage/schema.sql`), so a response cannot be traced to its account. A second submission returns 409. Deleting an account removes the participation mark; the anonymous responses stay (`app/auth/postgres_repository.py`).

## Changes to the previous wording
- "Tu cuenta" did not say that queries are linked to the account; it now does, and says anonymous queries are not linked to anyone.
- "Tus derechos" said the history could be deleted, which read as erasing the records; the backend only unlinks them from the account. It now says so and adds deletion by email.
- New rows: "Dónde se alojan" (Azure), "Cuánto tiempo los guardamos" (retention and cache expiry), "Responsables" (controllers and contact).
- T2 rows: "Encuesta de opinión" (after "Tu cuenta") and "Cambios en esta política" (last, with "Última actualización: 22 de noviembre de 2026").

## Acceptance
- The privacy view renders nine rows in Spanish and English, with the contact email twice, Microsoft Azure, both controllers, the anonymous survey disclosure and the last-updated date.
- Every popup string equals the landing `DICT` entry (tags stripped).
- `node --test` has no new failures compared with the branch base.

## Evidence (2026-11-22)
- Baseline on `feat/azure-backend`: `node --test` -> 513 tests, 510 pass, 0 fail, 3 skipped (loopback backend tests).
- RED: `node --test tests/privacy-views.test.js` -> 4 tests, 0 pass, 4 fail.
- GREEN: `node --test tests/privacy-views.test.js` -> 4 tests, 4 pass, 0 fail; full `node --test` -> 514 tests, 511 pass, 0 fail, 3 skipped (same three).
- `git diff --check` -> exit 0; no placeholders (`TBD`, `[correo]`, `TODO`) in the changed files.
- T1 commit: `8c347f4` (docs(privacy): add controller, contact, hosting and retention).
- T2 RED: `node --test tests/privacy-views.test.js` -> 5 tests, 1 pass, 4 fail.
- T2 GREEN: `node --test tests/privacy-views.test.js` -> 5 tests, 5 pass; full `node --test` -> 515 tests, 512 pass, 0 fail, 3 skipped (same three loopback tests).
- T2 parity script (popup catalog vs landing `DICT`, es/en) -> 38 strings compared, all equal. `git diff --check` -> exit 0.
- T2 commit: the work-unit commit that updates this document (`docs(privacy): disclose SUS survey and add update date`).

## Next step
Check the popup in real Chrome (nine rows fit and scroll). When the policy changes again, update the date in both the popup and `sereno-landing/privacy.html`.

# Store package

## Objective and authorization
Prepare Sereno 0.3.0 for a Chrome Web Store submission: a reproducible, dependency-free script that builds `dist/sereno-<version>.zip` with only the runtime files, and a `CHROMEWEBSTORE.md` with everything the owner pastes into the Developer Dashboard, verified against the code. Local work only: no push, PR or merge.

## Problem and why
The repository manifest keeps `http://127.0.0.1:5000/*` for local development, and the README told the owner to delete it (and adjust the manifest test) by hand before a submission. A hand-edited upload is easy to get wrong (a dev host permission, tests, ODD notes or agent tooling inside the zip, or a `config.js` still pointing at loopback). The dashboard also needs a single purpose, permission justifications and data-use answers that match the code and the published privacy policy.

## Scope and constraints
- Allowed edit surfaces: `scripts/**`, `tests/**`, `CHROMEWEBSTORE.md`, `README.md`, `.gitignore`, this document.
- `manifest.json` and runtime sources stay untouched; the repo manifest keeps the loopback entry.
- No npm dependencies (no `package.json`); tests run with `node --test` from the root.
- `tests/architecture.test.js` scans every `.js` outside `tests/`, `odd/` and agent folders: the script must not name `fetch(`, `baseUrl` or the provider config.
- Store copy in Spanish (primary, "tú") and English; no metrics or accuracy claims.

## Delivery
Branch `feat/store-package` from `main`. Two work-unit commits (T1, T2). RDD: not started by this bounded writer; ordinary functional verification applies.

## Tasks
- [x] T1: `scripts/store-package.js` + `tests/store-package.test.js` (RED first): packaged manifest without the loopback host permission, file selection from the real references (manifest, pages, worker imports, CSS `url()`, plus `assets/`, `icons/`, `_locales/`), dev-only guard, loopback-reference guard, deterministic zip writer and read-back verification; `dist/` ignored. Route: inline (two new files, no unresolved design).
- [x] T2: `CHROMEWEBSTORE.md` (template from the chrome-extensions skill) and a short README pointer. Route: inline (docs).

## Acceptance
- `node scripts/store-package.js` writes `dist/sereno-0.3.0.zip`; its manifest lacks `http://127.0.0.1:5000/*` and is otherwise identical; every file referenced by the manifest, the pages, the worker and the CSS is inside; no `tests/`, `odd/`, `scripts/`, `tools/`, `.agents/`, `.git*`, Markdown or build-only CSS.
- `node --test`: no new failures against the baseline (515 tests, 512 pass, 0 fail, 3 skipped).
- `CHROMEWEBSTORE.md` matches the code and `privacy/ui/privacy-views.js`.

## Decisions
- Zip written by Node itself (`zlib.deflateRawSync` + CRC-32, fixed 1980-01-01 timestamps, sorted entries) instead of `tar -a`: same bytes on every OS for the same sources, no dependence on which `tar` is first in `PATH` (Git Bash ships GNU tar, which cannot write zip). Windows `bsdtar` is used only as an independent reader in a test.
- Selection follows references, not an exclusion list: JS/CSS ship only if the manifest, a page, the worker or a stylesheet loads them. `assets/`, `icons/` and `_locales/` ship whole because views name icons at run time. Result: `content/content.css` and `ui/verdict-modal.css` (inputs of `tools/build-content-assets.js`, already inside `content-assets.generated.js`) stay out.
- The build refuses to run if a packaged file still contains a dropped dev origin (e.g. `config.js` left on loopback), since the packaged manifest would no longer grant it.

## Evidence
- RED (T1): `node --test tests/store-package.test.js` -> 1 file failed (module `scripts/store-package.js` missing).
- GREEN (T1): `node --test tests/store-package.test.js tests/architecture.test.js` -> 15 tests, 15 pass. Full `node --test` -> 524 tests, 521 pass, 0 fail, 3 skipped (the three loopback-backend tests; baseline 515/512/0/3 plus 9 new).
- Build: `node scripts/store-package.js` -> `dist/sereno-0.3.0.zip`, 196,722 bytes, 84 files; dropped `http://127.0.0.1:5000/*`. Two builds give the same SHA-256 (`d77eb191…c3e354`). Windows `tar.exe -tf` lists the same 84 entries; the extracted manifest grants only the Azure origin.
- `git diff --check` -> exit 0.
- Commit T1: `ed672bd` (build(store): add web store packaging script).
- T2 checks (structural, passive docs): the privacy policy URL and the homepage answer 200 and the policy text matches `privacy/ui/privacy-views.js` (ten sections, dated 22 November 2026, contact u202220528@upc.edu.pe); backend `GET /v1/model` -> 200. `icons/icon128.png` read as 128x128 RGBA. Locale short descriptions: es 119, en 110 characters. Code scan: no `eval`, `new Function`, dynamic `import()` or remote scripts; the content script reads only `location.href`; the worker reads only `tab.url`; verdicts need no session; the options page is gated to administrators. Full `node --test` after T2 -> 524 tests, 521 pass, 0 fail, 3 skipped; rebuild unchanged (196,722 bytes, 84 files).
- Commit T2: see `git log` (docs(store): add Chrome Web Store submission guide).

## Next step
Owner: create screenshots and the small promo tile, register the developer account, upload the zip and fill the dashboard from `CHROMEWEBSTORE.md`.

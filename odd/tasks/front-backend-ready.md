# Feature: front-backend-ready

Branch: `feat/front-backend-ready`
Skills required: `chrome-extensions`, `modern-web-guidance`, `design-patterns`
Delivery strategy: ask-on-risk (forecast ~1500 authored lines; chain strategy to be asked before the second slice)

## Objective

Finish the Sereno front end at 100% so that connecting the backend means only
changing the provider and the base URL. No UI or use-case rewrite afterwards.

## Problem

- HU-04/05/22/25 only work inside the demo store: no service worker, no content script, no real-tab badge.
- No error, offline, timeout or degraded-protection states (HU-25/26).
- Use cases are synchronous and read `platform/seed.js` directly; passwords are compared in plain text.
- Nothing calls a backend; there is no provider seam.

## Scope

In: provider ports (verdict, auth, data) with mock and remote adapters, one config switch,
async use cases, service worker, content script, degraded/error UI, a11y, manifest cleanup, docs.
Out: the backend itself, ML, real persistence, metrics aggregation (HU-02, 06-12, 16, 27 training, 30, 31).

## Constraints

- Manifest V3, no eval, no inline scripts, async/await only, no state in service-worker globals (use `chrome.storage`).
- Classic scripts in the `globalThis.Sereno` namespace, no build step (README "Notas técnicas").
- `*/domain/*` stays pure; only `platform/` touches `chrome.*`.
- Strict TDD: RED then GREEN with `node --test` where a deterministic test applies.
- Per-task size heuristic ~400 authored changed lines (advisory only).
- Code, comments, UI copy in the existing project language (Spanish UI, English identifiers).

## Acceptance criteria

- Changing `provider` from `mock` to `remote` and setting `baseUrl` in a single config file is the only step to use a backend.
- Swapping in the backend touches at most 2 files: `platform/providers/config.js` and the remote adapter. UI, containers, domains and use cases never change.
- An architecture test enforces it: `fetch`, `XMLHttpRequest`, `chrome.runtime.sendMessage` to a backend and any `Sereno.providers.*` adapter are referenced only inside `platform/providers/`; everything else depends on the ports through one composition root (`Sereno.services`).
- Real navigation on http/https pages produces a verdict, badge and in-page modal using the mock provider.
- Timeout, offline and cache-down show a degraded state; nothing throws.
- `node --test` is green; README documents the provider contract.

## Tasks

- [x] T1 Provider ports, config switch, mock + remote adapters, composition root `Sereno.services`, architecture guard test (tests first)
- [ ] T2 Async verdict service with timeout, offline and degraded states (HU-25/26)
- [ ] T3 Auth provider port: session token, remove plain-text compare (HU-13/14/15)
- [ ] T4 Data providers for history, policy, cache, metrics, model version, survey (HU-17-21, 27-29, 32)
- [ ] T5 Service worker: navigation to verdict, real-tab badge, history write (HU-04/05/22/25)
- [ ] T6 Content script: in-page modal for warn/block/pending/degraded (HU-05/22/25)
- [ ] T7 UI states and a11y: degraded banner, errors, focus trap, ARIA, reduced motion
- [ ] T8 Manifest cleanup (name, permissions, host_permissions, CSP, min Chrome) and README provider guide

## Route declaration

| Task | Route | Trigger evidence |
|---|---|---|
| T1-T8 | delegated direct, one writer at a time | each touches 2+ non-trivial files; audit already mapped the code (read-only explorer a77ccabee52997f4e) |

## Progress

T1 done: provider ports, config switch, mock and remote adapters, composition root `Sereno.services`, architecture guard. Not yet wired into any page (T2-T4).

## Verification evidence

Baseline: `node --test` = 66 pass, 0 fail (before changes).

T1:
- RED: with only the tests written, `node --test` = 68 pass, 1 fail (`tests/providers.test.js` could not load, `platform/providers/*` missing). `tests/architecture.test.js` passed trivially (no violations existed yet); its detection was checked by adding a temporary file with `fetch(`, which failed the test, then removing it.
- GREEN: `node --test` = 89 pass, 0 fail (66 baseline + 23 new).
- Commit: 6b206b0

## Next step

Launch the writer for T2 (async verdict service with timeout, offline and degraded states on top of `Sereno.services.verdict`).

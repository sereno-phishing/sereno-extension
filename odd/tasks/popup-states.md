# Popup states and pending copy

Branch: `fix/popup-states-and-pending-copy` (from `main` at `9e74647`).

## Objective

Every sentence Sereno shows must be true for the page the user is looking at.

## Findings and required behaviour

1. **The pending notice promises a retry that does not exist.** The page toast
   said "Reintentando automáticamente..." while a verdict was pending. Nothing
   retries: one request per navigation, then a final outcome. The copy must say
   what happens, in Spanish and English. No automatic retry is added.
2. **The popup shows the last evaluated site on pages Sereno does not
   evaluate.** Tabs that are not http(s) left `currentSite` untouched, and pages
   of the backend origin published `null` (the idle card, which promises an
   evaluation that never comes). Required: a dedicated "not evaluated" card for
   those pages, modelled explicitly in the domain; the idle card only before
   anything is known; switching tabs or windows keeps the card truthful; badge
   cleared, no request, no history entry.

## Work units

- [x] WU1 `fix(verdict)`: truthful pending and degraded copy (route: inline, single writer).
- [ ] WU2 `fix(popup)`: not-evaluated state on pages Sereno skips (route: inline, single writer).

## Checks

- `node --test` from the repository root: 0 failures, 0 skipped.
- `rg -n -i "reintent|retry" . --glob "!odd/**" --glob "!tests/**"`: every hit justified.
- `node tools/build-content-assets.js` leaves no diff.

## Evidence

WU1 facts: the toast appears after 300 ms (`verdict/domain/outcome.js:27`,
`verdict/application/verdict-service.js:72`); the request is aborted at 4 s
(`platform/providers/config.js:13`) with a 6 s outer deadline
(`verdict/application/verdict-service.js:18`); a failure or timeout becomes one
final `degraded` outcome (fail-open notice). Only a new navigation or a reload
asks again (`protection/application/navigation-service.js`, "loading" event).
Copy: "Reintentando automáticamente..." / "Retrying automatically..." ->
"Sereno sigue evaluando este sitio." / "Sereno is still evaluating this site."
The degraded notices and the popup strings made no retry claim and are unchanged.
RED: `node --test tests/pending-copy.test.js` 3 of 4 failing before the fix.
GREEN: `node --test` 489 pass, 0 fail, 0 skipped.

## Next step

WU2: not-evaluated state.

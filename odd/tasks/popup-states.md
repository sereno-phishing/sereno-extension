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
- [x] WU2 `fix(popup)`: not-evaluated state on pages Sereno skips (route: inline, single writer).

- [x] WU3 `fix(protection)`: a reload always asks again and one navigation makes one request (end-to-end findings 1 and 2).
- [x] WU4 `fix(popup)`: a degraded site is not shown as "Evaluando…" (finding 3).
- [ ] WU5 `fix(admin)`: metrics section without horizontal overflow (finding 4).

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
GREEN: `node --test` 489 pass, 0 fail, 0 skipped. Commit `e8310e4`.

WU2: `currentSite` is now the site of an outcome, `{ kind: "not_evaluated" }`
(`outcomes.notEvaluatedSite()`), or `null` (nothing known yet, idle card).
The navigation use case classifies a url as evaluate / skip / ignore; skip
(not http(s), or the backend origin) drops the tab record, clears the badge and,
on the active tab, publishes the not-evaluated site. Events relied on:
`tabs.onUpdated`, `tabs.onActivated` and the new `windows.onFocusChanged`; the
popup only reads the shared store. Deviation: the Sereno detail page
(`app/popup/popup.html` opened in a tab by "Ver detalle") is ignored instead of
skipped, because it exists to show the current site; an unknown address is
ignored too.
RED: 12 failing across `tests/not-evaluated-pages.test.js`,
`tests/backend-pages.test.js`, `tests/popup-site-card.test.js` and
`tests/popup-i18n.test.js` before the fix (the service worker tests were added
with the fix). GREEN: `node --test` 501 pass, 0 fail, 0 skipped.

WU2 commit `c1160c7`.

WU3 (found in Chromium 145). Cause 1: `complete` closed the navigation only when
an outcome was already stored, so on a page that completes before its verdict
the record stayed `navigating` and a reload within 10 s was taken for a repeated
`loading`. Cause 2: `loading` and `complete` arrive 1 ms apart and both read the
tab record before either wrote it, so both started an evaluation. Fix: the
steps that read and write a tab record run in arrival order per tab
(`inTabOrder`), `complete` always closes the navigation, a `loading` after it
is a reload that gets a new token, and an answer is stored and shown only while
the record carries its token. RED: 4 new tests failing in
`tests/navigation-reload.test.js`. GREEN: `node --test` 505 pass, 0 fail, 0 skipped.

WU3 commit `c91ab86`.

WU4. Cause: `siteOf` published a degraded outcome with the status "evaluando"
and `statusId` returned "pendiente" for it, so the popup card drew the pending
pill next to the "could not be checked" note. Fix: a `sin_evaluar` status
("Sin evaluar" / "Not evaluated", neutral tone, glyph "?") in the verdict
catalog; `siteOf` and `statusId` use it for a degraded outcome and the site card
shows that pill, not busy, whenever the level is degraded. The toolbar badge
was already "?". The extension writes no history: entries come from the backend
on an answered `/v1/verdict`. RED: 7 failing. GREEN: `node --test` 507 pass, 0
fail, 0 skipped.

## Next step

Check both fixes in a real Chrome (tab and window switches, new tab page, the
"Ver detalle" tab, the pending toast on a slow backend). Push and pull request
are the owner's decision.

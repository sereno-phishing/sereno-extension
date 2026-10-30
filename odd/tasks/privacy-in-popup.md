# Privacy policy inside the popup

## Objective
Show the privacy policy as a view inside the popup (like the survey) instead of opening a separate extension tab, and keep one text source for the extension and the future public page.

## Problem and rationale
The footer link opens `app/privacy/privacy.html` in a new tab, which closes the popup for four short rows of text. The Chrome Web Store separately requires a public policy URL (data leaves the device) and an in-product disclosure; an in-popup view serves the second, the landing page will serve the first.

## Authorized scope
sereno-extension only: new popup view `privacy`, one es/en text catalog (existing `privacy.*` keys, texts unchanged), popup navigation (open from footer link, back to home), removal of `app/privacy/` and anything that only it used. No text/legal changes, no landing changes (follow-up), no manifest permission changes.

## Constraints
Strict TDD, `node --test "tests/**/*.test.js"` (baseline 502). Reuse existing patterns (survey view + back link, `Sereno.i18n.register`, skeleton/motion tokens, one-shot motion hooks). No dead code left behind. Preserve CRLF. Accessible: view has a heading, back button, focus handled like other popup views.

## Work units
- [x] T1 In-popup privacy view, navigation, single catalog, tests, README, delete `app/privacy/`.

## Follow-ups (not in scope)
Public policy page in `sereno-landing` (Chrome Web Store URL); review of policy wording for store requirements (what is collected, used, shared); decide whether onboarding links to the policy.

## Next step
T1 done (509 tests pass). Manual popup check pending (focus, layout in es/en, back from History).

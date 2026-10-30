# SUS survey language support

## Objective
Show the SUS survey (questions, scale labels, buttons, notes, errors) in Spanish or English following the extension language preference. Stored answers remain language-neutral integers 1-5.

## Problem and rationale
Survey text is hard-coded in Spanish in `survey/domain/sus.js` and `survey/ui/survey-views.js`, and survey errors reach the view as Spanish message strings. The backend stores only numbers, so translation is front-end only.

## Authorized scope
Front end only (sereno-extension). Domain exposes language-neutral data; the view owns all text through `Sereno.i18n`. English questions use Brooke's original SUS wording with "system" replaced by "Sereno". No backend change, no change to the Spanish wording.

## Constraints
Strict TDD (`node --test "tests/**/*.test.js"`), RED before GREEN. No dead code left behind (domain must not keep unused Spanish labels). Preserve CRLF line endings.

## Work units
- [x] T1 Survey domain neutral (`QUESTION_COUNT`, `score` returns `bandId` only), view translated via i18n catalog, error codes (not Spanish messages) flow to the survey views, tests, README.

## Next step
Review and commit T1.

## Evidence
T1: RED (survey.test.js band assertions, new survey-views-i18n tests) then GREEN, 468 pass. popup-views no longer forces lang="es" on survey; survey views translate error codes (timeout, offline, server, cache_down; unknown reads as server).

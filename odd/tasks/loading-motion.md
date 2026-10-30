# Skeleton loading states and restrained motion

## Objective
Replace text/spinner loading states with skeletons that mirror the final layout, and add a small, deliberate motion language (premium, not generic). Visual design, colours, spacing and copy stay unchanged.

## Problem and rationale
Loading is shown as plain text ("Cargando...") or an empty circle; layout jumps when data arrives and state changes feel abrupt. Skeletons that match the real layout remove the jump; a few well-chosen transitions give feedback without slowing a frequently used popup.

## Authorized scope
Front end only (sereno-extension): popup, admin panel, survey, verdict modal (content script shadow DOM). Shared primitives in `ui/tokens.css` / `ui/atoms.js`. Regenerate `content/content-assets.generated.js` when CSS changes.

## Motion rules (emilkowalski animate + modern-web-guidance motion)
- Gate every animation: frequency tier + named purpose; 100+/day or keyboard-initiated actions never animate.
- Properties: `transform`/`opacity` only (compositor); never `transition: all`; never `scale(0)`; never `ease-in`.
- Tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`; UI durations <= 300ms.
- Skeleton shimmer is one shared primitive; reduced motion = static (no sweep), gentler not zero for entrances; hover motion gated by `(hover: hover) and (pointer: fine)`.
- Skeleton blocks are `aria-hidden`; the loading status text stays for assistants (`role="status"` / `aria-busy`), visually hidden when the skeleton shows.

## Constraints
Strict TDD where a deterministic test exists (markup/contract tests); CSS motion verified by structural tests + a manual feel-check list. No dead code left behind. Preserve CRLF. English technical artifacts; existing es/en text tables untouched except where a loading label is needed.

## Work units
- [x] T1 Skeleton primitive + loading surfaces (popup boot, history list, admin initial + sections, survey status/submitting, protection pending, account menu survey item).
- [x] T2 Motion: press feedback, account menu popover, survey question/progress/thanks, history first-load stagger, admin chart bars, verdict modal enter, tab indicator 240ms (writer done, 502 tests pass; not committed).

## Rejected (gate)
Tab switching and hover on list rows (tens/day: no or imperceptible), protection polling updates, keyboard-initiated actions.

## T2 notes
- Containers redraw with innerHTML, so entrances hang on one-shot `data-enter` hooks: `App.enter` ("menu" | "thanks" | "history"), `App.surveyFrom`, admin `App.chartEnter`; each is cleared by the render that consumed it (tests prove plain redraws carry no hook).
- Progress fill uses translateX (not scaleX) so the rounded end is not stretched.
- Skipped: thank-you checkmark (adds an element, changes layout); exits (menu, verdict dialog close instantly).
- Tab indicator moved from 400ms to 240ms --ease-in-out; its pinned test was updated.

## Next step
T2 written; needs a manual feel-check in the real popup, admin and page, then a work-unit commit.

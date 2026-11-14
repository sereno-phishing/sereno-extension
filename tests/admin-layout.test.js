"use strict";

/* Layout of the admin metrics section, checked on the stylesheet text (there
   is no browser here). The section must not overflow horizontally: the
   sparkline bars shrink with their card, the stat cards wrap instead of being
   squeezed, and below the narrow breakpoint the sidebar stacks above the
   content and wide tables scroll inside their card. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "app", "admin", "admin.css"), "utf8");

/* The stylesheet outside its media queries, and the body of one media query. */
function mediaBlock(query) {
  const start = css.indexOf("@media " + query);
  if (start < 0) {
    return null;
  }
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) {
      return css.slice(css.indexOf("{", start) + 1, index);
    }
  }
  return null;
}

const base = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

function rule(sheet, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp("(?:^|\\}|\\*/)\\s*" + escaped + "\\s*\\{([^}]*)\\}").exec(sheet);
  return found ? found[1] : null;
}

test("the sparkline strip is as wide as its card allows, up to the seven-bar design width", () => {
  const strip = rule(base, ".stat-bars");
  assert.ok(strip, ".stat-bars is styled");
  assert.match(strip, /\bwidth:\s*100%;/);
  assert.match(strip, /max-width:\s*200px;/);
  assert.doesNotMatch(strip, /(?:^|[\s;])width:\s*\d+px/, "no fixed width that a narrow card cannot hold");
  /* Seven bars of 26px and six gaps of 3px are the 200px of the design. */
  assert.match(strip, /gap:\s*3px;/);
  assert.equal(7 * 26 + 6 * 3, 200);
});

test("the sparkline bars shrink with the strip instead of sticking out of the card", () => {
  const bar = rule(base, ".stat-bar");
  assert.ok(bar, ".stat-bar is styled");
  assert.match(bar, /flex:\s*0 1 26px;/, "26px at most, and allowed to shrink");
  assert.match(bar, /min-width:\s*0;/);
});

test("the stat cards wrap into as many equal columns as fit, never narrower than the container", () => {
  const grid = rule(base, ".stat-grid");
  assert.ok(grid, ".stat-grid is styled");
  assert.match(grid, /display:\s*grid;/);
  assert.match(grid, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(200px,\s*100%\),\s*1fr\)\);/);
  assert.match(rule(base, ".stat-card"), /min-width:\s*0;/);
});

test("a narrow window stacks the sidebar above the content and scrolls wide tables inside their card", () => {
  const narrow = mediaBlock("(max-width: 720px)");
  assert.ok(narrow, "there is a narrow breakpoint");
  assert.match(rule(narrow, ".options-shell"), /flex-direction:\s*column;/);
  const sidebar = rule(narrow, ".sidebar");
  assert.match(sidebar, /width:\s*auto;/);
  assert.match(sidebar, /flex:\s*0 0 auto;/);
  assert.match(sidebar, /min-height:\s*0;/);
  assert.match(rule(narrow, ".table-card"), /overflow-x:\s*auto;/);
  assert.match(rule(narrow, ".data-table"), /min-width:\s*\d+px;/);
  assert.match(rule(narrow, ".card-head"), /flex-wrap:\s*wrap;/);
  assert.match(rule(narrow, ".legend"), /flex-wrap:\s*wrap;/);
});

test("outside the narrow breakpoint the shell keeps the 240px sidebar of the design", () => {
  const sidebar = rule(base, ".sidebar");
  assert.match(sidebar, /flex:\s*0 0 240px;/);
  assert.match(sidebar, /width:\s*240px;/);
  assert.match(rule(base, ".options-content"), /min-width:\s*0;/);
});

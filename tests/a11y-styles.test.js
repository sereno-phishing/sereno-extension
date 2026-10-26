"use strict";

/* Accessibility of the stylesheets: reduced motion in every stylesheet that
   animates, a visible focus style, the helper classes the views rely on and
   WCAG 2 AA contrast of the colour pairs the design tokens produce. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SKIP = new Set(["node_modules", ".git", ".claude", "tests", "odd"]);

function stylesheets(dir = ROOT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, "/");

/* ---------------- contrast helpers (pure) ---------------- */

function channel(value) {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [red, green, blue] = [1, 3, 5].map((index) => channel(parseInt(hex.slice(index, index + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function tokens() {
  const block = read("ui/tokens.css").match(/:root,\s*:host\s*\{([^}]*)\}/)[1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((match) => [match[1], match[2]]));
}

function resolve(value, palette) {
  const text = value.trim();
  const variable = text.match(/^var\(--([\w-]+)\)$/);
  if (variable) return palette[variable[1]];
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text : null;
}

/* Colour and background of the first plain rule for a selector. */
function ruleColors(css, selector, palette) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = [...css.matchAll(new RegExp(`(?:^|\\n|,\\s*)${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "g"))];
  assert.ok(rules.length, `${selector} has a rule`);
  const body = rules.map((rule) => rule[1]).join("\n");
  const color = body.match(/(?:^|[;\s])color:\s*([^;]+);/);
  const background = body.match(/background(?:-color)?:\s*([^;]+);/);
  assert.ok(color && background, `${selector} sets a text and a background colour`);
  return { color: resolve(color[1], palette), background: resolve(background[1], palette) };
}

/* ---------------- reduced motion ---------------- */

test("every stylesheet that animates or transitions honors prefers-reduced-motion", () => {
  const sheets = stylesheets();
  assert.ok(sheets.length >= 7, "found the stylesheets");
  const animating = sheets.filter((file) => /@keyframes|\banimation\s*:|\btransition\s*:|scroll-behavior/.test(fs.readFileSync(file, "utf8")));
  assert.ok(animating.length >= 3, "at least popup, store and content animate");
  for (const file of animating) {
    assert.match(fs.readFileSync(file, "utf8"), /prefers-reduced-motion/, `${rel(file)} animates without a reduced-motion rule`);
  }
});

test("the demo store turns its fade animations and transitions off for reduced motion", () => {
  const css = read("app/demo-store/store.css");
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, "store.css has a reduce block");
  assert.match(block[1], /\.demo-tooltip\.is-visible[\s\S]*animation: none/);
  assert.match(block[1], /\.demo-toast\.is-visible/);
  assert.match(block[1], /\.demo-panel[\s\S]*transition: none/);
});

test("the popup skeleton pulse runs only when motion is allowed", () => {
  const css = read("app/popup/popup.css");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.boot-skeleton-line\s*\{\s*animation:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.app-shell \.tabs\[data-tab-slide\]::before/);
});

/* ---------------- focus and helpers ---------------- */

test("one shared focus-visible ring covers every interactive element", () => {
  const css = read("ui/tokens.css");
  const rule = css.match(/:where\(([^)]*)\):focus-visible\s*\{([^}]*)\}/);
  assert.ok(rule, "tokens.css has a :focus-visible rule");
  for (const selector of ["a", "button", "input", "select", "textarea", "[tabindex]"]) {
    assert.ok(rule[1].split(",").map((item) => item.trim()).includes(selector), `${selector} is covered`);
  }
  assert.match(rule[2], /outline:\s*2px solid var\(--indigo-600\)/);
  assert.match(rule[2], /outline-offset:/);
});

test("form fields keep a visible focus indicator instead of removing the outline", () => {
  const css = read("ui/tokens.css");
  const focus = css.match(/\.input:focus\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(focus, /outline:\s*none/);
  for (const file of stylesheets()) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/([^{}]+)\{[^}]*outline:\s*(?:none|0)\b[^}]*\}/g)) {
      assert.match(match[1], /\[tabindex="-1"\]/, `${rel(file)}: "${match[1].trim()}" removes the outline without replacement`);
    }
  }
});

test("the helper classes the views use are defined once in the shared tokens", () => {
  const css = read("ui/tokens.css");
  assert.match(css, /\.sr-only\s*\{[^}]*position:\s*absolute[^}]*clip-path/);
  assert.match(css, /\.skip-link\s*\{[^}]*transform:\s*translateY\(-200%\)/);
  assert.match(css, /\.skip-link:focus\s*\{[^}]*transform:\s*none/);
  assert.match(css, /\.tab-panel\s*\{\s*display:\s*contents/);
  assert.match(read("app/admin/admin.html"), /tokens\.css/);
});

/* ---------------- contrast ---------------- */

test("the contrast helper matches published WCAG reference ratios", () => {
  assert.equal(contrast("#000000", "#FFFFFF").toFixed(1), "21.0");
  assert.equal(contrast("#767676", "#FFFFFF").toFixed(2), "4.54");
  assert.ok(contrast("#777777", "#FFFFFF") < 4.5);
});

const TEXT_PAIRS = [
  ["ink", "bg"], ["ink", "page"], ["ink", "slate-50"], ["muted", "bg"], ["muted", "page"], ["muted", "soft"],
  ["muted", "slate-50"], ["muted", "slate-100"], ["subtle", "bg"], ["subtle", "page"],
  ["indigo-600", "bg"], ["indigo-600", "indigo-50"], ["indigo-700", "indigo-50"], ["indigo-700", "indigo-100"],
  ["green-700", "green-bg"], ["amber-700", "amber-bg"], ["red-700", "red-bg"],
  ["green-800", "green-bg"], ["amber-800", "amber-bg"], ["red-800", "red-bg"], ["amber-800", "bg"],
  ["red-600", "bg"], ["slate-600", "bg"]
];

test("text and background token pairs reach 4.5:1 (WCAG AA)", () => {
  const palette = tokens();
  for (const [foreground, background] of TEXT_PAIRS) {
    assert.ok(palette[foreground] && palette[background], `${foreground} and ${background} exist`);
    const ratio = contrast(palette[foreground], palette[background]);
    assert.ok(ratio >= 4.5, `${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

test("white text on the solid fills used for buttons and chips reaches 4.5:1", () => {
  const palette = { ...tokens(), white: "#FFFFFF" };
  for (const fill of ["indigo-600", "indigo-700", "red-600", "red-700", "dark", "slate-800", "green-700", "amber-700"]) {
    const ratio = contrast(palette.white, palette[fill]);
    assert.ok(ratio >= 4.5, `white on ${fill} is ${ratio.toFixed(2)}:1`);
  }
});

test("the colours the stylesheets actually pair, once resolved, reach 4.5:1", () => {
  const palette = tokens();
  const tokensCss = read("ui/tokens.css");
  const popupCss = read("app/popup/popup.css");
  const checks = [
    [tokensCss, [".chip-seguro", ".chip-advertencia", ".chip-bloqueado", ".chip-soft-seguro", ".chip-soft-advertencia",
      ".chip-soft-bloqueado", ".chip-soft-neutral", ".hu-chip", ".btn-primary", ".btn-danger", ".banner-error", ".banner-success",
      ".avatar", ".admin-pill"]],
    [popupCss, [".protection-card.is-degraded", ".protection-card", ".session-notice"]]
  ];
  for (const [css, selectors] of checks) {
    for (const selector of selectors) {
      const { color, background } = ruleColors(css, selector, palette);
      assert.ok(color && background, `${selector} resolves to token colours`);
      const ratio = contrast(color, background);
      assert.ok(ratio >= 4.5, `${selector}: ${color} on ${background} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("placeholders use the subtle token, which reaches 4.5:1 on the input background", () => {
  const palette = tokens();
  assert.match(read("ui/tokens.css"), /\.input::placeholder\s*\{\s*color:\s*var\(--subtle\)/);
  assert.ok(contrast(palette.subtle, palette.bg) >= 4.5);
});

"use strict";

/* Presentational functions are plain data -> HTML string, so they run in
   Node without a DOM. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { ui, verdictUi } = load("verdict/domain/verdict.js", "ui/atoms.js", "ui/molecules.js", "verdict/ui/verdict-ui.js");

test("esc neutralizes HTML-significant characters", () => {
  assert.equal(ui.esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(ui.esc(null), "");
  assert.equal(ui.esc(0), "0");
});

test("button atom", () => {
  assert.equal(
    ui.button({ label: "Iniciar sesión", variant: "primary", block: true, action: "go-login" }),
    '<button type="button" class="btn btn-primary btn-block" data-action="go-login">Iniciar sesión</button>'
  );
  assert.equal(
    ui.button({ label: "Atrás", variant: "ghost", action: "survey-back", disabled: true }),
    '<button type="button" class="btn btn-ghost" data-action="survey-back" disabled>Atrás</button>'
  );
  assert.equal(ui.button({ type: "submit", label: "Crear", variant: "primary" }), '<button type="submit" class="btn btn-primary">Crear</button>');
});

test("chip atom escapes data attributes and label", () => {
  assert.equal(
    ui.chip({ cls: "policy-chip", action: "pick", data: [["domain", 'a"b.pe'], ["policy", "bloqueo"]], pressed: false, label: "<x>" }),
    '<button type="button" class="policy-chip" data-action="pick" data-domain="a&quot;b.pe" data-policy="bloqueo" aria-pressed="false">&lt;x&gt;</button>'
  );
});

test("input atom omits empty value and placeholder", () => {
  assert.equal(ui.input({ cls: "input", type: "text", name: "u", value: "", assist: true }), '<input class="input" type="text" name="u" autocomplete="off" spellcheck="false">');
  assert.equal(ui.input({ cls: "input", type: "number", min: 1, name: "t", value: 7 }), '<input class="input" type="number" min="1" name="t" value="7">');
});

test("field molecule renders label, input and help", () => {
  const html = ui.field({ label: "Usuario", name: "username", type: "text", hasError: true, help: "Elige otro.", helpIsError: true });
  assert.match(html, /^<label class="field"><span class="field-label">Usuario<\/span><input class="input has-error"/);
  assert.match(html, /<span class="field-help field-help-error">Elige otro\.<\/span><\/label>$/);
});

test("verdict pills and toolbar badge follow the status tone", () => {
  assert.match(verdictUi.pill("advertencia", "sm"), /^<span class="pill pill-sm pill-warn"><img class="art art-12" src="\.\.\/\.\.\/assets\/icons\/warn\.svg" alt="">/);
  assert.match(verdictUi.pill("evaluando", "md"), /pill-neutral"><span class="art-glyph art-14">◔<\/span><span>Evaluando…<\/span>/);
  assert.equal(verdictUi.adminPill("bloqueo"), '<span class="pill pill-bloqueo"><img class="pill-img" src="../../assets/icons/admin-pill-bad.svg" alt="">Bloqueado</span>');
  assert.deepEqual(verdictUi.toolbarBadge("seguro"), { text: "✓", color: "#16A34A" });
  assert.deepEqual(verdictUi.toolbarBadge("pendiente"), { text: "…", color: "#6B7280" });
  assert.deepEqual(verdictUi.toolbarBadge("bloqueo"), { text: "✕", color: "#DC2626" });
});

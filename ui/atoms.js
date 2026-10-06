/* Design system · atoms: the smallest reusable pieces of markup (escaped
   text, images, buttons, chips, pills, inputs, banners). Classic script that
   registers Sereno.ui. Every function takes plain data and returns an HTML
   string; none reads state or wires events. Interaction is declared with
   data-action attributes that the page containers delegate. */

(function (Sereno) {
  "use strict";

  /* Every page lives two levels below the extension root (app/<surface>/). */
  var ASSET_ROOT = "../../assets/";

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asset(path) {
    return ASSET_ROOT + path;
  }

  /* Ordered [name, value] pairs -> ' name="value"' string. */
  function attrs(pairs) {
    return (pairs || [])
      .map(function (pair) {
        return " " + pair[0] + '="' + esc(pair[1]) + '"';
      })
      .join("");
  }

  function classes(list) {
    return list.filter(Boolean).join(" ");
  }

  function image(path, cls, alt) {
    return '<img class="' + cls + '" src="' + asset(path) + '" alt="' + esc(alt || "") + '">';
  }

  /* Decorative SVG from assets/icons by file name without extension. */
  function icon(name, cls) {
    return image("icons/" + name + ".svg", cls, "");
  }

  /* Fixed-size popup artwork: class "art art-<size>". */
  function art(name, size) {
    return icon(name, "art art-" + size);
  }

  function logo(cls, alt) {
    return image("logo.png", cls, alt);
  }

  /* options: { label, variant: primary|ghost|danger, block, cls, action, type, disabled } */
  function button(options) {
    return (
      '<button type="' + (options.type || "button") + '" class="' +
      classes(["btn", "btn-" + options.variant, options.block && "btn-block", options.cls]) + '"' +
      (options.action ? ' data-action="' + options.action + '"' : "") +
      (options.disabled ? " disabled" : "") + ">" + esc(options.label) + "</button>"
    );
  }

  /* Toggle chip. options: { cls, action, data: [[name, value]], pressed, lead, label } */
  function chip(options) {
    return (
      '<button type="button" class="' + options.cls + '" data-action="' + options.action + '"' +
      attrs((options.data || []).map(function (pair) {
        return ["data-" + pair[0], pair[1]];
      })) +
      ' aria-pressed="' + !!options.pressed + '">' + (options.lead || "") + esc(options.label) + "</button>"
    );
  }

  function pill(cls, content) {
    return '<span class="pill ' + cls + '">' + content + "</span>";
  }

  /* options: { cls, type, name, placeholder, value, min, assist } — assist adds
     the autocomplete/spellcheck opt-outs used by free-text fields. */
  function input(options) {
    var hasValue = options.value !== undefined && options.value !== null && options.value !== "";
    return (
      '<input class="' + options.cls + '" type="' + options.type + '"' +
      (options.min !== undefined ? ' min="' + options.min + '"' : "") +
      ' name="' + options.name + '"' +
      (options.placeholder ? ' placeholder="' + esc(options.placeholder) + '"' : "") +
      (hasValue ? ' value="' + esc(options.value) + '"' : "") +
      (options.assist ? ' autocomplete="off" spellcheck="false"' : "") + ">"
    );
  }

  /* options: { tone: error|success, cls, role, iconHtml, text } */
  function banner(options) {
    return (
      '<div class="' + classes(["banner-" + options.tone, options.cls]) + '" role="' + options.role + '">' +
      options.iconHtml + "<span>" + esc(options.text) + "</span></div>"
    );
  }

  Sereno.ui = {
    esc: esc,
    asset: asset,
    attrs: attrs,
    classes: classes,
    image: image,
    icon: icon,
    art: art,
    logo: logo,
    button: button,
    chip: chip,
    pill: pill,
    input: input,
    banner: banner
  };
})(globalThis.Sereno = globalThis.Sereno || {});

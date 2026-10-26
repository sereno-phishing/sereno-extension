/* Design system · atoms: the smallest reusable pieces of markup (escaped
   text, images, buttons, chips, pills, inputs, banners). Classic script that
   registers Sereno.ui. Every function takes plain data and returns an HTML
   string; none reads state or wires events. Interaction is declared with
   data-action attributes that the page containers delegate. */

(function (Sereno) {
  "use strict";

  /* Every page lives two levels below the extension root (app/<surface>/). A
     content script runs on foreign pages, so it points the root at the
     extension with setAssetRoot. */
  var DEFAULT_ASSET_ROOT = "../../assets/";
  var assetRoot = DEFAULT_ASSET_ROOT;

  /* Inline mode (content script): { name: "<svg ...>" }. When set, icons and the
     logo are drawn as inline svg and nothing points at an extension URL, so a
     foreign page is never asked to load one (and its img-src policy cannot
     block them). null keeps the default: <img> from the asset root. */
  var inlineIcons = null;

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asset(path) {
    return assetRoot + path;
  }

  /* Called without an argument it restores the default relative root. */
  function setAssetRoot(root) {
    assetRoot = root || DEFAULT_ASSET_ROOT;
  }

  /* Switches the icons to inline svg fed by a { name: markup } map (see
     tools/build-content-assets.js); called without a map it goes back to <img>. */
  function setInlineAssets(icons) {
    inlineIcons = icons || null;
  }

  /* Root <svg> of the bundled markup with a class, an optional size and the
     accessibility attributes of a picture; a missing icon draws nothing. */
  function inlineSvg(name, cls, size, alt) {
    var markup = inlineIcons[name];
    if (!markup) {
      return "";
    }
    return markup.replace(/^<svg\b([^>]*)>/, function (match, attributes) {
      var rest = attributes.replace(/\s(?:class|role|aria-hidden|aria-label|focusable)="[^"]*"/g, "");
      if (size) {
        rest = rest.replace(/\s(?:width|height)="[^"]*"/g, "");
      }
      return (
        "<svg" + (cls ? ' class="' + esc(cls) + '"' : "") +
        (size ? ' width="' + size + '" height="' + size + '"' : "") +
        (alt ? ' role="img" aria-label="' + esc(alt) + '"' : ' aria-hidden="true" focusable="false"') +
        rest + ">"
      );
    });
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
    if (inlineIcons) {
      var named = /^icons\/(.+)\.svg$/.exec(path);
      return named ? inlineSvg(named[1], cls, 0, alt) : "";
    }
    return '<img class="' + cls + '" src="' + asset(path) + '" alt="' + esc(alt || "") + '">';
  }

  /* Decorative SVG from assets/icons by file name without extension. */
  function icon(name, cls) {
    return image("icons/" + name + ".svg", cls, "");
  }

  /* Icon with an explicit pixel size (class optional), as the views of the in-page
     modal need it. */
  function sizedIcon(name, cls, size) {
    if (inlineIcons) {
      return inlineSvg(name, cls, size, "");
    }
    return (
      "<img" + (cls ? ' class="' + cls + '"' : "") + ' src="' + asset("icons/" + name + ".svg") + '" width="' + size +
      '" height="' + size + '" alt="">'
    );
  }

  /* Fixed-size popup artwork: class "art art-<size>". */
  function art(name, size) {
    return icon(name, "art art-" + size);
  }

  /* The PNG logo; inline mode draws the brand mark instead. */
  function logo(cls, alt) {
    if (inlineIcons) {
      return inlineSvg("brand", cls, 0, alt);
    }
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

  /* Toggle chip. options: { cls, action, data: [[name, value]], pressed, lead, label, ariaLabel }
     ariaLabel extends the visible label (it must start with it) for chips that repeat in a table. */
  function chip(options) {
    return (
      '<button type="button" class="' + options.cls + '" data-action="' + options.action + '"' +
      attrs((options.data || []).map(function (pair) {
        return ["data-" + pair[0], pair[1]];
      })) +
      (options.ariaLabel ? ' aria-label="' + esc(options.ariaLabel) + '"' : "") +
      ' aria-pressed="' + !!options.pressed + '">' + (options.lead || "") + esc(options.label) + "</button>"
    );
  }

  function pill(cls, content) {
    return '<span class="pill ' + cls + '">' + content + "</span>";
  }

  /* options: { cls, type, name, placeholder, value, min, assist, autocomplete, id,
     ariaLabel, labelledBy, invalid, describedBy } — assist adds the spellcheck opt-out and,
     unless autocomplete names a token, the autocomplete opt-out of free-text fields. The aria
     options give the input a programmatic name, a validity state and its help or error text. */
  function input(options) {
    var hasValue = options.value !== undefined && options.value !== null && options.value !== "";
    return (
      '<input class="' + options.cls + '" type="' + options.type + '"' +
      (options.min !== undefined ? ' min="' + options.min + '"' : "") +
      ' name="' + options.name + '"' +
      (options.placeholder ? ' placeholder="' + esc(options.placeholder) + '"' : "") +
      (hasValue ? ' value="' + esc(options.value) + '"' : "") +
      (options.autocomplete
        ? ' autocomplete="' + esc(options.autocomplete) + '"' + (options.assist ? ' spellcheck="false"' : "")
        : options.assist ? ' autocomplete="off" spellcheck="false"' : "") +
      (options.id ? ' id="' + esc(options.id) + '"' : "") +
      (options.ariaLabel ? ' aria-label="' + esc(options.ariaLabel) + '"' : "") +
      (options.labelledBy ? ' aria-labelledby="' + esc(options.labelledBy) + '"' : "") +
      (options.invalid ? ' aria-invalid="true"' : "") +
      (options.describedBy ? ' aria-describedby="' + esc(options.describedBy) + '"' : "") + ">"
    );
  }

  /* options: { tone: error|success, cls, role, id, iconHtml, text } — role is "alert" for failures, "status" otherwise. */
  function banner(options) {
    return (
      '<div class="' + classes(["banner-" + options.tone, options.cls]) + '" role="' + options.role + '"' +
      (options.id ? ' id="' + esc(options.id) + '"' : "") + ">" +
      options.iconHtml + "<span>" + esc(options.text) + "</span></div>"
    );
  }

  Sereno.ui = {
    esc: esc,
    asset: asset,
    setAssetRoot: setAssetRoot,
    setInlineAssets: setInlineAssets,
    attrs: attrs,
    classes: classes,
    image: image,
    icon: icon,
    sizedIcon: sizedIcon,
    art: art,
    logo: logo,
    button: button,
    chip: chip,
    pill: pill,
    input: input,
    banner: banner
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Verdict modal · presentational in-page verdict view (warning and block).
   Both verdicts share one card; the copy differs per verdict and the domain,
   risk, score and source come from the verdict of the outcome. Classic script
   that registers Sereno.verdictModal.
     renderDialog  native <dialog>; the container opens it with showModal(),
                   which makes the page inert, traps focus and restores it on
                   close. The block dialog is not closable. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var verdict = Sereno.verdict;

  /* key prefixes the element ids the container drives (<key>-dialog, -details, -stamp). */
  var COPY = {
    advertencia: {
      key: "warning",
      title: "Este sitio puede ser phishing",
      text: "El dominio imita a un sitio de pagos conocido. Si ingresas tus datos aquí, podrían robarlos.",
      actions: [
        { cls: "verdict-btn-dark", label: "Volver", action: "volver" },
        { cls: "verdict-btn-ghost", label: "Continuar bajo riesgo", action: "continuar" }
      ]
    },
    bloqueo: {
      key: "block",
      title: "Sitio bloqueado",
      text: "Este dominio está clasificado como phishing y la política no permite continuar. Tus datos no se enviaron.",
      actions: [{ cls: "verdict-btn-danger", label: "Volver a un sitio seguro", action: "volver" }]
    }
  };

  var MESSAGES = {
    titleWarning: { es: "Este sitio puede ser phishing", en: "This site may be phishing" },
    textWarning: { es: "El dominio imita a un sitio de pagos conocido. Si ingresas tus datos aquí, podrían robarlos.", en: "The domain imitates a known payment site. If you enter your data here, it could be stolen." },
    titleBlock: { es: "Sitio bloqueado", en: "Site blocked" },
    textBlock: { es: "Este dominio está clasificado como phishing y la política no permite continuar. Tus datos no se enviaron.", en: "This domain is classified as phishing and the policy does not allow you to continue. Your data was not sent." },
    back: { es: "Volver", en: "Go back" }, continue: { es: "Continuar bajo riesgo", en: "Continue at your own risk" },
    safe: { es: "Volver a un sitio seguro", en: "Return to a safe site" },
    risk: { es: "Nivel de riesgo", en: "Risk level" }, score: { es: "Score del modelo", en: "Model score" },
    date: { es: "Fecha de clasificación", en: "Classification date" }, source: { es: "Fuente del veredicto", en: "Verdict source" },
    brand: { es: "Protegido por Sereno", en: "Protected by Sereno" }, show: { es: "Ver detalle", en: "Show details" },
    hide: { es: "Ocultar detalle", en: "Hide details" }, open: { es: "Abrir detalle en Sereno", en: "Open details in Sereno" },
    riskPrefix: { es: "Riesgo ", en: "Risk " },
    riskHigh: { es: "Alto", en: "High" }, riskHighLower: { es: "alto", en: "high" },
    riskMedium: { es: "Medio", en: "Medium" }, riskMediumLower: { es: "medio", en: "medium" },
    riskLow: { es: "Bajo", en: "Low" }, riskLowLower: { es: "bajo", en: "low" },
    riskUnknown: { es: "—", en: "—" }, sourceCache: { es: "Caché", en: "Cache" },
    sourceModel: { es: "Modelo", en: "Model" }
  };
  var entries = {};
  Object.keys(MESSAGES).forEach(function (key) { entries["modal." + key] = MESSAGES[key]; });
  if (Sereno.i18n) Sereno.i18n.register(entries);
  function text(key) { return Sereno.i18n ? Sereno.i18n.t("modal." + key) : MESSAGES[key].es; }
  function marked(key) { return '<span data-modal-i18n="' + key + '">' + ui.esc(text(key)) + '</span>'; }
  function translate(root) {
    root.querySelectorAll("[data-modal-i18n]").forEach(function (node) { node.textContent = text(node.getAttribute("data-modal-i18n")); });
    root.querySelectorAll('[data-action="toggle-detail"]').forEach(function (node) { node.textContent = text(node.getAttribute("aria-expanded") === "true" ? "hide" : "show"); });
  }

  function sizedIcon(name, cls, size) {
    return ui.sizedIcon(name, cls, size);
  }

  function detailRow(label, valueHtml) {
    return (
      '\n<div class="verdict-detail-row">\n<span class="verdict-detail-label">' + marked(label) + "</span>\n" +
      valueHtml + "\n</div>"
    );
  }

  function detailValue(text, id) {
    return '<span class="verdict-detail-value"' + (id ? ' id="' + id + '"' : "") + ">" + ui.esc(text) + "</span>";
  }

  /* Element ids of the modal for a verdict status, or null when it has none. */
  function keyOf(statusId) {
    return COPY[statusId] ? COPY[statusId].key : null;
  }

  /* Only a warning can be dismissed or continued; a block never can. */
  function isClosable(statusId) {
    return statusId === "advertencia";
  }

  function canContinue(statusId) {
    return statusId === "advertencia";
  }

  /* found: the verdict of an outcome ({ domain, status, score, source }).
     options: { openDetail } adds the link that opens the full detail from the
     details panel. The card carries no dialog role: the native <dialog> around
     it already has one. */
  function card(found, options) {
    var settings = options || {};
    var copy = COPY[found.status];
    var tone = verdict.status(found.status).tone;
    var key = copy.key;
    var facts = { risk: "risk", score: "score", date: "date", source: "source" };
    var warning = found.status === "advertencia";
    var risk = verdict.riskLevel(found);
    var riskKey = { Alto: "riskHigh", Medio: "riskMedium", Bajo: "riskLow" }[risk] || "riskUnknown";
    var lowerRiskKey = riskKey === "riskUnknown" ? riskKey : riskKey + "Lower";
    var sourceKey = found.source === "cache" ? "sourceCache" : "sourceModel";
    var percent = verdict.scorePercent(found.score);
    return (
      '<section class="verdict-modal">\n' +
      '<header class="verdict-band verdict-band-' + tone + '">\n' +
      sizedIcon("alert-" + tone + "-44", "verdict-icon", 44) + "\n" +
      '<h2 class="verdict-title verdict-title-' + tone + '" id="' + key + '-title">' + marked(warning ? "titleWarning" : "titleBlock") + "</h2>\n" +
      "</header>\n" +
      '<div class="verdict-body">\n' +
      '<div class="verdict-domain-row">\n<span class="verdict-domain">' + ui.esc(found.domain) + "</span>\n" +
      '<span class="verdict-pill verdict-pill-' + tone + '">' + sizedIcon("alert-" + tone + "-14", "", 14) +
      marked("riskPrefix") + marked(lowerRiskKey) + "</span>\n</div>\n" +
      '<p class="verdict-text" id="' + key + '-text">' + marked(warning ? "textWarning" : "textBlock") + "</p>\n" +
      '<div class="verdict-details" id="' + key + '-details" hidden>' +
      detailRow(facts.risk, '<span class="verdict-detail-value">' + marked(riskKey) + '</span>') +
      detailRow(
        facts.score,
        '<span class="verdict-score">\n<span class="verdict-score-track"><span class="verdict-score-fill verdict-score-fill-' + tone +
          '" data-percent="' + percent + '"></span></span>\n' +
          detailValue(Number(found.score).toFixed(2)) + "\n</span>"
      ) +
      detailRow(facts.date, detailValue("—", key + "-stamp")) +
      detailRow(facts.source, '<span class="verdict-source">' + marked(sourceKey) + "</span>") +
      (settings.openDetail
        ? '\n<button type="button" class="verdict-toggle verdict-open-detail" data-action="open-detail">' + marked("open") + '</button>'
        : "") +
      "\n</div>\n" +
      '<div class="verdict-actions">\n' +
      copy.actions.map(function (item) {
        return '<button type="button" class="verdict-btn ' + item.cls + '" data-action="' + item.action + '">' + marked(item.action === "continuar" ? "continue" : warning ? "back" : "safe") + "</button>";
      }).join("\n") +
      "\n</div>\n</div>\n" +
      '<footer class="verdict-foot">\n' +
      '<span class="verdict-brand">' + ui.logo("verdict-logo", "") + marked("brand") + "</span>\n" +
      '<button type="button" class="verdict-toggle" data-action="toggle-detail" data-detail="' + key + '" aria-expanded="false" ' +
      'aria-controls="' + key + '-details">' + text("show") + '</button>\n' +
      "</footer>\n</section>"
    );
  }

  /* Native dialog shell. A block dialog says closedby="none" and data-closable
     "false" so neither Esc nor a close request dismisses it. */
  function renderDialog(found, options) {
    var key = COPY[found.status].key;
    var closable = isClosable(found.status);
    return (
      '<dialog class="verdict-dialog" id="' + key + '-dialog" aria-labelledby="' + key + '-title" aria-describedby="' + key +
      '-text" closedby="' + (closable ? "closerequest" : "none") + '" data-closable="' + closable + '">\n' +
      card(found, { openDetail: !!(options && options.openDetail) }) + "\n</dialog>"
    );
  }

  Sereno.verdictModal = {
    translate: translate,
    keyOf: keyOf,
    isClosable: isClosable,
    canContinue: canContinue,
    renderDialog: renderDialog
  };
})(globalThis.Sereno = globalThis.Sereno || {});

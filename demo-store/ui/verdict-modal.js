/* Verdict modal · presentational in-page verdict view (warning and block),
   shared by the demo store and the real pages. Both verdicts share one card;
   the copy differs per verdict and the domain, risk, score and source come
   from the scenario or the outcome. Classic script that registers
   Sereno.verdictModal. Two shells wrap the same card:
     render        demo overlay (div + section[role=dialog]), rendered hidden
     renderDialog  native <dialog> for real pages; the container opens it with
                   showModal(), which makes the page inert, traps focus and
                   restores it on close. The block dialog is not closable. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var verdict = Sereno.verdict;
  var verdictUi = Sereno.verdictUi;

  /* key prefixes the element ids the container drives (<key>-overlay, -details, -stamp). */
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

  function sizedIcon(name, cls, size) {
    return (
      "<img" + (cls ? ' class="' + cls + '"' : "") + ' src="' + ui.asset("icons/" + name + ".svg") + '" width="' + size +
      '" height="' + size + '" alt="">'
    );
  }

  function detailRow(label, valueHtml) {
    return (
      '\n<div class="verdict-detail-row">\n<span class="verdict-detail-label">' + ui.esc(label) + "</span>\n" +
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

  /* options: { dialogRole, openDetail }. dialogRole puts role="dialog" on the
     card (the demo overlay); a native <dialog> already has it. openDetail adds
     the link that opens the full detail from the details panel. */
  function card(scenario, options) {
    var settings = options || {};
    var copy = COPY[scenario.status];
    var tone = verdict.status(scenario.status).tone;
    var key = copy.key;
    var facts = verdictUi.FACT_LABELS;
    var risk = verdict.riskLevel(scenario);
    var percent = verdict.scorePercent(scenario.score);
    return (
      '<section class="verdict-modal"' +
      (settings.dialogRole ? ' role="dialog" aria-modal="true" aria-labelledby="' + key + '-title"' : "") + ">\n" +
      '<header class="verdict-band verdict-band-' + tone + '">\n' +
      sizedIcon("alert-" + tone + "-44", "verdict-icon", 44) + "\n" +
      '<h2 class="verdict-title verdict-title-' + tone + '" id="' + key + '-title">' + ui.esc(copy.title) + "</h2>\n" +
      "</header>\n" +
      '<div class="verdict-body">\n' +
      '<div class="verdict-domain-row">\n<span class="verdict-domain">' + ui.esc(scenario.domain) + "</span>\n" +
      '<span class="verdict-pill verdict-pill-' + tone + '">' + sizedIcon("alert-" + tone + "-14", "", 14) +
      "Riesgo " + ui.esc(risk.toLowerCase()) + "</span>\n</div>\n" +
      '<p class="verdict-text" id="' + key + '-text">' + ui.esc(copy.text) + "</p>\n" +
      '<div class="verdict-details" id="' + key + '-details" hidden>' +
      detailRow(facts.risk, detailValue(risk)) +
      detailRow(
        facts.score,
        '<span class="verdict-score">\n<span class="verdict-score-track"><span class="verdict-score-fill verdict-score-fill-' + tone +
          " score-" + percent + '" data-percent="' + percent + '"></span></span>\n' +
          detailValue(Number(scenario.score).toFixed(2)) + "\n</span>"
      ) +
      detailRow(facts.date, detailValue("—", key + "-stamp")) +
      detailRow(facts.source, '<span class="verdict-source">' + ui.esc(verdict.sourceLabel(scenario.source)) + "</span>") +
      (settings.openDetail
        ? '\n<button type="button" class="verdict-toggle verdict-open-detail" data-action="open-detail">Abrir detalle en Sereno</button>'
        : "") +
      "\n</div>\n" +
      '<div class="verdict-actions">\n' +
      copy.actions.map(function (item) {
        return '<button type="button" class="verdict-btn ' + item.cls + '" data-action="' + item.action + '">' + ui.esc(item.label) + "</button>";
      }).join("\n") +
      "\n</div>\n</div>\n" +
      '<footer class="verdict-foot">\n' +
      '<span class="verdict-brand">' + ui.logo("verdict-logo", "") + "Protegido por Sereno</span>\n" +
      '<button type="button" class="verdict-toggle" data-action="toggle-detail" data-detail="' + key + '" aria-expanded="false" ' +
      'aria-controls="' + key + '-details">Ver detalle</button>\n' +
      "</footer>\n</section>"
    );
  }

  function render(scenario) {
    var key = COPY[scenario.status].key;
    return '<div class="demo-overlay" id="' + key + '-overlay" hidden>\n' + card(scenario, { dialogRole: true }) + "\n</div>";
  }

  /* Native dialog shell. A block dialog says closedby="none" and data-closable
     "false" so neither Esc nor a close request dismisses it. */
  function renderDialog(scenario, options) {
    var key = COPY[scenario.status].key;
    var closable = isClosable(scenario.status);
    return (
      '<dialog class="verdict-dialog" id="' + key + '-dialog" aria-labelledby="' + key + '-title" aria-describedby="' + key +
      '-text" closedby="' + (closable ? "closerequest" : "none") + '" data-closable="' + closable + '">\n' +
      card(scenario, { dialogRole: false, openDetail: !!(options && options.openDetail) }) + "\n</dialog>"
    );
  }

  Sereno.verdictModal = {
    keyOf: keyOf,
    isClosable: isClosable,
    canContinue: canContinue,
    render: render,
    renderDialog: renderDialog
  };
})(globalThis.Sereno = globalThis.Sereno || {});

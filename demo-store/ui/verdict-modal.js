/* Demo store · presentational in-page verdict modal (warning and block).
   Both modals share one template; the copy differs per verdict and the
   domain, risk, score and source come from the scenario. Classic script that
   registers Sereno.verdictModal. Rendered hidden; the container shows it. */

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

  function render(scenario) {
    var copy = COPY[scenario.status];
    var tone = verdict.status(scenario.status).tone;
    var key = copy.key;
    var facts = verdictUi.FACT_LABELS;
    var risk = verdict.riskLevel(scenario);
    return (
      '<div class="demo-overlay" id="' + key + '-overlay" hidden>\n' +
      '<section class="verdict-modal" role="dialog" aria-modal="true" aria-labelledby="' + key + '-title">\n' +
      '<header class="verdict-band verdict-band-' + tone + '">\n' +
      sizedIcon("alert-" + tone + "-44", "verdict-icon", 44) + "\n" +
      '<h2 class="verdict-title verdict-title-' + tone + '" id="' + key + '-title">' + ui.esc(copy.title) + "</h2>\n" +
      "</header>\n" +
      '<div class="verdict-body">\n' +
      '<div class="verdict-domain-row">\n<span class="verdict-domain">' + ui.esc(scenario.domain) + "</span>\n" +
      '<span class="verdict-pill verdict-pill-' + tone + '">' + sizedIcon("alert-" + tone + "-14", "", 14) +
      "Riesgo " + ui.esc(risk.toLowerCase()) + "</span>\n</div>\n" +
      '<p class="verdict-text">' + ui.esc(copy.text) + "</p>\n" +
      '<div class="verdict-details" id="' + key + '-details" hidden>' +
      detailRow(facts.risk, detailValue(risk)) +
      detailRow(
        facts.score,
        '<span class="verdict-score">\n<span class="verdict-score-track"><span class="verdict-score-fill verdict-score-fill-' + tone +
          " score-" + verdict.scorePercent(scenario.score) + '"></span></span>\n' +
          detailValue(Number(scenario.score).toFixed(2)) + "\n</span>"
      ) +
      detailRow(facts.date, detailValue("—", key + "-stamp")) +
      detailRow(facts.source, '<span class="verdict-source">' + ui.esc(verdict.sourceLabel(scenario.source)) + "</span>") +
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
      "</footer>\n</section>\n</div>"
    );
  }

  Sereno.verdictModal = {
    keyOf: keyOf,
    render: render
  };
})(globalThis.Sereno = globalThis.Sereno || {});

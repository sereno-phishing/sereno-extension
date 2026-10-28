/* Survey · presentational views: one SUS question, backend status and the
   submission outcome. Classic script that registers Sereno.surveyUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var survey = Sereno.survey;

  var PRIVACY_NOTE = "Tus respuestas no incluyen tu usuario. Registramos tu participación para evitar envíos repetidos.";

  function scaleButton(value, selected) {
    var pressed = selected === value;
    return (
      '<button type="button" class="' + ui.classes(["scale-btn", pressed && "is-selected"]) + '" data-action="answer" ' +
      'data-value="' + value + '" aria-pressed="' + pressed + '">' + value + "</button>"
    );
  }

  /* model: { index, selected } */
  function questionView(model) {
    var total = survey.QUESTIONS.length;
    var progress = Math.round(((model.index + 1) / total) * 100);
    return (
      '<section class="view view-survey">' +
      '<button type="button" class="back-link" data-action="survey-close">← Volver al inicio</button>' +
      '<div class="survey-meta">Pregunta ' + (model.index + 1) + " de " + total + "</div>" +
      '<div class="progress-track" role="progressbar" aria-label="Progreso de la encuesta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
      '<h1 class="survey-question">' + ui.esc(survey.QUESTIONS[model.index]) + "</h1>" +
      '<div class="scale" role="group" aria-label="Tu respuesta, de ' + survey.SCALE[0] + " (totalmente en desacuerdo) a " +
      survey.SCALE[survey.SCALE.length - 1] + ' (totalmente de acuerdo)">' + survey.SCALE.map(function (value) {
        return scaleButton(value, model.selected);
      }).join("") + "</div>" +
      '<div class="scale-labels"><span>Totalmente en desacuerdo</span><span>Totalmente de acuerdo</span></div>' +
      '<div class="flex-spacer"></div>' +
      '<p class="survey-note">' + PRIVACY_NOTE + "</p>" +
      '<div class="survey-actions">' +
      ui.button({ label: "Atrás", variant: "ghost", action: "survey-back", disabled: model.index === 0 }) +
      ui.button({
        label: survey.isLastQuestion(model.index) ? "Finalizar" : "Siguiente",
        variant: "primary",
        action: "survey-next",
        disabled: !model.selected
      }) +
      "</div></section>"
    );
  }

  /* model: { state: "loading" | "error", error? } */
  function statusView(model) {
    var failed = model.state === "error";
    return (
      '<section class="view view-survey-result"><h1 class="sr-only">Encuesta de opinión</h1><div class="sus-result">' +
      (failed
        ? ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: model.error }) +
          ui.button({ label: "Reintentar", variant: "ghost", action: "survey-status-retry" })
        : '<p class="sus-note" role="status">Cargando el estado de la encuesta…</p>') +
      ui.button({ label: "Cerrar", variant: "primary", cls: "sus-close", action: "survey-close" }) +
      "</div></section>"
    );
  }

  /* model.state: "submitting" | "accepted" | "already" | "error" */
  function resultView(model) {
    var body = "";
    if (model.state === "submitting") {
      body = '<p class="sus-note" role="status">Enviando tus respuestas…</p>';
    } else if (model.state === "accepted" || model.state === "already") {
      body = '<h1 role="status">Gracias por tu opinión</h1>';
    } else {
      body = '<h1>No se pudo enviar la encuesta</h1>' +
        ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: model.error }) +
        ui.button({ label: "Reintentar", variant: "ghost", action: "survey-retry" });
    }
    return (
      '<section class="view view-survey-result">' +
      (model.state === "submitting" ? '<h1 class="sr-only">Envío de la encuesta</h1>' : "") +
      '<div class="sus-result">' + body +
      ui.button({ label: "Cerrar", variant: "primary", cls: "sus-close", action: "survey-close" }) +
      "</div></section>"
    );
  }

  Sereno.surveyUi = {
    questionView: questionView,
    statusView: statusView,
    resultView: resultView
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Survey · presentational views: one SUS question with its scale, and the
   final score. Classic script that registers Sereno.surveyUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var survey = Sereno.survey;

  var ANONYMOUS = "Tus respuestas son anónimas.";

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
      '<p class="survey-note">' + ANONYMOUS + "</p>" +
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

  /* result: survey.score() output; options.error: Spanish text when the
     submission failed (the score still shows, the user can retry). */
  function resultView(result, options) {
    var error = options && options.error;
    return (
      '<section class="view view-survey-result"><h1 class="sr-only">Resultado de la encuesta</h1><div class="sus-result">' +
      '<div class="sus-score">' + result.score + " / 100</div>" +
      '<div class="sus-band sus-band-' + result.bandId + '">' + ui.esc(result.band) + "</div>" +
      '<p class="sus-note">' + ANONYMOUS + "</p>" +
      (error
        ? ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: error }) +
          ui.button({ label: "Reintentar", variant: "ghost", action: "survey-retry" })
        : "") +
      ui.button({ label: "Cerrar", variant: "primary", cls: "sus-close", action: "survey-close" }) +
      "</div></section>"
    );
  }

  Sereno.surveyUi = {
    questionView: questionView,
    resultView: resultView
  };
})(globalThis.Sereno = globalThis.Sereno || {});

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
      '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
      '<h2 class="survey-question">' + ui.esc(survey.QUESTIONS[model.index]) + "</h2>" +
      '<div class="scale">' + survey.SCALE.map(function (value) {
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

  /* result: survey.score() output. */
  function resultView(result) {
    return (
      '<section class="view view-survey-result"><div class="sus-result">' +
      '<div class="sus-score">' + result.score + " / 100</div>" +
      '<div class="sus-band sus-band-' + result.bandId + '">' + ui.esc(result.band) + "</div>" +
      '<p class="sus-note">' + ANONYMOUS + "</p>" +
      ui.button({ label: "Cerrar", variant: "primary", cls: "sus-close", action: "survey-close" }) +
      "</div></section>"
    );
  }

  Sereno.surveyUi = {
    questionView: questionView,
    resultView: resultView
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Survey · presentational views: one SUS question, backend status and the
   submission outcome. Classic script that registers Sereno.surveyUi. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var survey = Sereno.survey;

  var ERRORS = ["timeout", "offline", "server", "cache_down"];
  var messages = {
    q1: ["Creo que me gustaría usar Sereno con frecuencia.", "I think that I would like to use Sereno frequently."],
    q2: ["Encontré que Sereno era innecesariamente complejo.", "I found Sereno unnecessarily complex."],
    q3: ["Me pareció que Sereno era fácil de usar.", "I thought Sereno was easy to use."],
    q4: ["Creo que necesitaría apoyo técnico para poder usar Sereno.", "I think that I would need the support of a technical person to be able to use Sereno."],
    q5: ["Encontré que las distintas funciones de Sereno estaban bien integradas.", "I found the various functions in Sereno were well integrated."],
    q6: ["Encontré que Sereno era demasiado inconsistente.", "I thought there was too much inconsistency in Sereno."],
    q7: ["Imagino que la mayoría de la gente aprendería a usar Sereno muy rápido.", "I would imagine that most people would learn to use Sereno very quickly."],
    q8: ["Encontré que Sereno era muy engorroso de usar.", "I found Sereno very cumbersome to use."],
    q9: ["Me sentí muy seguro/a usando Sereno.", "I felt very confident using Sereno."],
    q10: ["Necesité aprender muchas cosas antes de poder empezar a usar Sereno.", "I needed to learn a lot of things before I could get going with Sereno."],
    back: ["Volver al inicio", "Back to home"],
    progress: ["Pregunta {n} de {total}", "Question {n} of {total}"],
    progressLabel: ["Progreso de la encuesta", "Survey progress"],
    scaleLabel: ["Tu respuesta, de {min} (totalmente en desacuerdo) a {max} (totalmente de acuerdo)", "Your answer, from {min} (strongly disagree) to {max} (strongly agree)"],
    disagree: ["Totalmente en desacuerdo", "Strongly disagree"], agree: ["Totalmente de acuerdo", "Strongly agree"],
    privacy: ["Tus respuestas no incluyen tu usuario. Registramos tu participación para evitar envíos repetidos.", "Your answers do not include your username. We record your participation to prevent repeated submissions."],
    previous: ["Atrás", "Back"], next: ["Siguiente", "Next"], finish: ["Finalizar", "Finish"],
    title: ["Encuesta de opinión", "Feedback survey"],
    loading: ["Cargando el estado de la encuesta…", "Loading the survey status…"],
    retry: ["Reintentar", "Retry"], close: ["Cerrar", "Close"],
    submittingTitle: ["Envío de la encuesta", "Survey submission"],
    submitting: ["Enviando tus respuestas…", "Sending your answers…"],
    thanks: ["Gracias por tu opinión", "Thank you for your feedback"],
    failed: ["No se pudo enviar la encuesta", "The survey could not be sent"],
    timeout: ["El servidor tardó demasiado en responder. Inténtalo de nuevo.", "The server took too long to respond. Try again."],
    offline: ["Sin conexión. Revisa tu red e inténtalo de nuevo.", "Offline. Check your connection and try again."],
    server: ["El servidor no está disponible. Inténtalo más tarde.", "The server is unavailable. Try again later."],
    cache_down: ["El caché de veredictos no está disponible. Inténtalo más tarde.", "The verdict cache is unavailable. Try again later."]
  };
  if (Sereno.i18n && Sereno.i18n.register) {
    var catalog = {};
    Object.keys(messages).forEach(function (key) { catalog["survey." + key] = { es: messages[key][0], en: messages[key][1] }; });
    Sereno.i18n.register(catalog);
  }
  function t(key) { return Sereno.i18n && Sereno.i18n.t ? Sereno.i18n.t("survey." + key) : messages[key][0]; }
  /* Fills {name} placeholders of a translated template. */
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (match, name) { return values[name]; });
  }
  /* Error codes arrive from the use cases; unknown ones read as a server problem. */
  function errorText(code) {
    return t(ERRORS.indexOf(code) < 0 ? "server" : code);
  }

  function scaleButton(value, selected) {
    var pressed = selected === value;
    return (
      '<button type="button" class="' + ui.classes(["scale-btn", pressed && "is-selected"]) + '" data-action="answer" ' +
      'data-value="' + value + '" aria-pressed="' + pressed + '">' + value + "</button>"
    );
  }

  /* model: { index, selected }. All text comes from the survey.* catalog. */
  function questionView(model) {
    var total = survey.QUESTION_COUNT;
    var progress = Math.round(((model.index + 1) / total) * 100);
    return (
      '<section class="view view-survey">' +
      '<button type="button" class="back-link" data-action="survey-close">← ' + t("back") + '</button>' +
      '<div class="survey-meta">' + fill(t("progress"), { n: model.index + 1, total: total }) + "</div>" +
      '<div class="progress-track" role="progressbar" aria-label="' + t("progressLabel") + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
      '<h1 class="survey-question">' + ui.esc(t("q" + (model.index + 1))) + "</h1>" +
      '<div class="scale" role="group" aria-label="' + fill(t("scaleLabel"), { min: survey.SCALE[0], max: survey.SCALE[survey.SCALE.length - 1] }) + '">' + survey.SCALE.map(function (value) {
        return scaleButton(value, model.selected);
      }).join("") + "</div>" +
      '<div class="scale-labels"><span>' + t("disagree") + '</span><span>' + t("agree") + '</span></div>' +
      '<div class="flex-spacer"></div>' +
      '<p class="survey-note">' + t("privacy") + "</p>" +
      '<div class="survey-actions">' +
      ui.button({ label: t("previous"), variant: "ghost", action: "survey-back", disabled: model.index === 0 }) +
      ui.button({
        label: survey.isLastQuestion(model.index) ? t("finish") : t("next"),
        variant: "primary",
        action: "survey-next",
        disabled: !model.selected
      }) +
      "</div></section>"
    );
  }

  /* model: { state: "loading" | "error", error? }; error is a code (timeout, offline, server, cache_down). */
  function statusView(model) {
    var failed = model.state === "error";
    return (
      '<section class="view view-survey-result"><h1 class="sr-only">' + t("title") + '</h1><div class="sus-result">' +
      (failed
        ? ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: errorText(model.error) }) +
          ui.button({ label: t("retry"), variant: "ghost", action: "survey-status-retry" })
        : '<p class="sus-note" role="status">' + t("loading") + '</p>') +
      ui.button({ label: t("close"), variant: "primary", cls: "sus-close", action: "survey-close" }) +
      "</div></section>"
    );
  }

  /* model.state: "submitting" | "accepted" | "already" | "error"; error is a code as in statusView. */
  function resultView(model) {
    var body = "";
    if (model.state === "submitting") {
      body = '<p class="sus-note" role="status">' + t("submitting") + "</p>";
    } else if (model.state === "accepted" || model.state === "already") {
      body = '<h1 role="status">' + t("thanks") + "</h1>";
    } else {
      body = '<h1>' + t("failed") + "</h1>" +
        ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: errorText(model.error) }) +
        ui.button({ label: t("retry"), variant: "ghost", action: "survey-retry" });
    }
    return (
      '<section class="view view-survey-result">' +
      (model.state === "submitting" ? '<h1 class="sr-only">' + t("submittingTitle") + "</h1>" : "") +
      '<div class="sus-result">' + body +
      ui.button({ label: t("close"), variant: "primary", cls: "sus-close", action: "survey-close" }) +
      "</div></section>"
    );
  }

  Sereno.surveyUi = {
    questionView: questionView,
    statusView: statusView,
    resultView: resultView
  };
})(globalThis.Sereno = globalThis.Sereno || {});

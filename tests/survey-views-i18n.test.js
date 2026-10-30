"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { i18n, surveyUi } = load("platform/i18n.js", "survey/domain/sus.js", "ui/atoms.js", "ui/molecules.js", "survey/ui/survey-views.js");

const QUESTIONS_ES = [
  "Creo que me gustaría usar Sereno con frecuencia.",
  "Encontré que Sereno era innecesariamente complejo.",
  "Me pareció que Sereno era fácil de usar.",
  "Creo que necesitaría apoyo técnico para poder usar Sereno.",
  "Encontré que las distintas funciones de Sereno estaban bien integradas.",
  "Encontré que Sereno era demasiado inconsistente.",
  "Imagino que la mayoría de la gente aprendería a usar Sereno muy rápido.",
  "Encontré que Sereno era muy engorroso de usar.",
  "Me sentí muy seguro/a usando Sereno.",
  "Necesité aprender muchas cosas antes de poder empezar a usar Sereno."
];
const QUESTIONS_EN = [
  "I think that I would like to use Sereno frequently.",
  "I found Sereno unnecessarily complex.",
  "I thought Sereno was easy to use.",
  "I think that I would need the support of a technical person to be able to use Sereno.",
  "I found the various functions in Sereno were well integrated.",
  "I thought there was too much inconsistency in Sereno.",
  "I would imagine that most people would learn to use Sereno very quickly.",
  "I found Sereno very cumbersome to use.",
  "I felt very confident using Sereno.",
  "I needed to learn a lot of things before I could get going with Sereno."
];

function text(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

test.afterEach(() => i18n.use("es"));

test("all ten question keys exist in both languages", () => {
  for (let number = 1; number <= 10; number += 1) {
    assert.equal(i18n.message("survey.q" + number, "es"), QUESTIONS_ES[number - 1]);
    assert.equal(i18n.message("survey.q" + number, "en"), QUESTIONS_EN[number - 1]);
  }
});

test("the question view keeps its Spanish copy", () => {
  i18n.use("es");
  const html = surveyUi.questionView({ index: 2, selected: null });
  assert.match(html, /← Volver al inicio/);
  assert.match(html, /Pregunta 3 de 10/);
  assert.match(html, /aria-label="Progreso de la encuesta"/);
  assert.match(html, new RegExp(QUESTIONS_ES[2]));
  assert.match(html, /aria-label="Tu respuesta, de 1 \(totalmente en desacuerdo\) a 5 \(totalmente de acuerdo\)"/);
  assert.match(html, /<span>Totalmente en desacuerdo<\/span><span>Totalmente de acuerdo<\/span>/);
  assert.match(html, /Tus respuestas no incluyen tu usuario/);
  assert.match(html, />Atrás</);
  assert.match(html, />Siguiente</);
  assert.match(surveyUi.questionView({ index: 9, selected: 3 }), />Finalizar</);
});

test("the question view renders in English", () => {
  i18n.use("en");
  const html = surveyUi.questionView({ index: 3, selected: null });
  assert.match(html, /← Back to home/);
  assert.match(html, /Question 4 of 10/);
  assert.match(html, /aria-label="Survey progress"/);
  assert.match(html, new RegExp(QUESTIONS_EN[3]));
  assert.match(html, /aria-label="Your answer, from 1 \(strongly disagree\) to 5 \(strongly agree\)"/);
  assert.match(html, /<span>Strongly disagree<\/span><span>Strongly agree<\/span>/);
  assert.match(html, /Your answers do not include your username/);
  assert.match(html, />Back</);
  assert.match(html, />Next</);
  assert.match(surveyUi.questionView({ index: 9, selected: 3 }), />Finish</);
  assert.doesNotMatch(html, /Pregunta|Siguiente|Atrás/);
});

test("status and result views render in Spanish and English", () => {
  i18n.use("es");
  assert.match(text(surveyUi.statusView({ state: "loading" })), /Encuesta de opinión Cargando el estado de la encuesta… Cerrar/);
  assert.match(text(surveyUi.resultView({ state: "submitting" })), /Envío de la encuesta Enviando tus respuestas… Cerrar/);
  assert.equal(text(surveyUi.resultView({ state: "accepted" })), "Gracias por tu opinión Cerrar");
  assert.match(text(surveyUi.resultView({ state: "error", error: "timeout" })), /No se pudo enviar la encuesta .*El servidor tardó demasiado en responder\. Inténtalo de nuevo\. Reintentar Cerrar/);
  assert.match(text(surveyUi.statusView({ state: "error", error: "offline" })), /Sin conexión\. Revisa tu red e inténtalo de nuevo\. Reintentar Cerrar/);

  i18n.use("en");
  assert.match(text(surveyUi.statusView({ state: "loading" })), /Feedback survey Loading the survey status… Close/);
  assert.match(text(surveyUi.resultView({ state: "submitting" })), /Survey submission Sending your answers… Close/);
  assert.equal(text(surveyUi.resultView({ state: "already" })), "Thank you for your feedback Close");
  assert.match(text(surveyUi.resultView({ state: "error", error: "timeout" })), /The survey could not be sent .*The server took too long to respond\. Try again\. Retry Close/);
  assert.match(text(surveyUi.statusView({ state: "error", error: "offline" })), /Offline\. Check your connection and try again\. Retry Close/);
});

test("error codes are translated by the views and unknown codes read as server", () => {
  const expected = {
    es: { server: "El servidor no está disponible. Inténtalo más tarde.", cache_down: "El caché de veredictos no está disponible. Inténtalo más tarde." },
    en: { server: "The server is unavailable. Try again later.", cache_down: "The verdict cache is unavailable. Try again later." }
  };
  for (const language of ["es", "en"]) {
    i18n.use(language);
    for (const view of [(error) => surveyUi.statusView({ state: "error", error }), (error) => surveyUi.resultView({ state: "error", error })]) {
      assert.match(view("cache_down"), new RegExp(expected[language].cache_down));
      assert.match(view("anything-else"), new RegExp(expected[language].server));
      assert.match(view(undefined), new RegExp(expected[language].server));
    }
  }
});

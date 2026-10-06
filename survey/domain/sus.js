/* Survey: the System Usability Scale (SUS) questionnaire and its scoring.
   Classic script that registers Sereno.survey. Pure. */

(function (Sereno) {
  "use strict";

  var QUESTIONS = [
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

  /* Likert scale values, 1 = strongly disagree, 5 = strongly agree. */
  var SCALE = [1, 2, 3, 4, 5];

  /* Lowest score of each band, highest band first. */
  var BANDS = [
    { min: 85, id: "excelente", label: "Excelente" },
    { min: 70, id: "bueno", label: "Bueno" },
    { min: 50, id: "aceptable", label: "Aceptable" },
    { min: -Infinity, id: "mejorar", label: "A mejorar" }
  ];

  /* One slot per question; missing answers become null. */
  function draftAnswers(stored) {
    var source = stored || [];
    return QUESTIONS.map(function (question, index) {
      return source[index] || null;
    });
  }

  /* Standard SUS: odd items score (value - 1), even items (5 - value), the
     sum times 2.5. Unanswered items count as 0. */
  function score(answers) {
    var total = 0;
    for (var index = 0; index < QUESTIONS.length; index += 1) {
      var value = Number(answers[index]) || 0;
      total += index % 2 === 0 ? value - 1 : 5 - value;
    }
    var result = Math.round(total * 2.5);
    var band = BANDS.filter(function (candidate) {
      return result >= candidate.min;
    })[0];
    return { score: result, band: band.label, bandId: band.id };
  }

  function isLastQuestion(index) {
    return index >= QUESTIONS.length - 1;
  }

  Sereno.survey = {
    QUESTIONS: QUESTIONS,
    SCALE: SCALE,
    draftAnswers: draftAnswers,
    score: score,
    isLastQuestion: isLastQuestion
  };
})(globalThis.Sereno = globalThis.Sereno || {});

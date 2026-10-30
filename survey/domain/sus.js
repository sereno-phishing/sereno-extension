/* Survey: the System Usability Scale (SUS) scale and its scoring.
   Language-neutral: all user-visible text lives in survey/ui/survey-views.js.
   Classic script that registers Sereno.survey. Pure. */

(function (Sereno) {
  "use strict";

  var QUESTION_COUNT = 10;

  /* Likert scale values, 1 = strongly disagree, 5 = strongly agree. */
  var SCALE = [1, 2, 3, 4, 5];

  /* Lowest score of each band, highest band first. */
  var BANDS = [
    { min: 85, id: "excelente" },
    { min: 70, id: "bueno" },
    { min: 50, id: "aceptable" },
    { min: -Infinity, id: "mejorar" }
  ];

  /* One slot per question; missing answers become null. */
  function draftAnswers(stored) {
    var source = stored || [];
    var drafts = [];
    for (var index = 0; index < QUESTION_COUNT; index += 1) {
      drafts.push(source[index] || null);
    }
    return drafts;
  }

  /* Standard SUS: odd items score (value - 1), even items (5 - value), the
     sum times 2.5. Unanswered items count as 0. */
  function score(answers) {
    var total = 0;
    for (var index = 0; index < QUESTION_COUNT; index += 1) {
      var value = Number(answers[index]) || 0;
      total += index % 2 === 0 ? value - 1 : 5 - value;
    }
    var result = Math.round(total * 2.5);
    var band = BANDS.filter(function (candidate) {
      return result >= candidate.min;
    })[0];
    return { score: result, bandId: band.id };
  }

  function isLastQuestion(index) {
    return index >= QUESTION_COUNT - 1;
  }

  Sereno.survey = {
    QUESTION_COUNT: QUESTION_COUNT,
    SCALE: SCALE,
    draftAnswers: draftAnswers,
    score: score,
    isLastQuestion: isLastQuestion
  };
})(globalThis.Sereno = globalThis.Sereno || {});

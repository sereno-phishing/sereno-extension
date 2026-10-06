/* Survey · use cases. Classic script that registers Sereno.surveyService. */

(function (Sereno) {
  "use strict";

  var time = Sereno.time;

  /* Stores the draft answers; completedAt is stamped only when the survey is finished. */
  function saveAnswers(store, answers, completed, now) {
    var copy = answers.slice();
    return store.update(function (state) {
      var survey = Object.assign({}, state.survey, { answers: copy });
      if (completed) {
        survey.completedAt = time.stamp(now);
      }
      return { survey: survey };
    });
  }

  Sereno.surveyService = {
    saveAnswers: saveAnswers
  };
})(globalThis.Sereno = globalThis.Sereno || {});

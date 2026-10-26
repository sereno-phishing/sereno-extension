/* Survey · use cases. Classic script that registers Sereno.surveyService.
   saveDraft keeps the unfinished answers in the local store (a UI draft, not
   backend data). submit is async, never throws and sends the finished survey
   through the data port; only after the backend accepted it does the local
   state record completedAt. Results: { ok: true } or
   { ok: false, error, message } (Sereno.providers.errors.CODES). */

(function (Sereno) {
  "use strict";

  var time = Sereno.time;

  function failure(error) {
    return Sereno.providers.errors.failure(error);
  }

  /* Stores the draft answers; completedAt is not touched. */
  async function saveDraft(store, answers) {
    try {
      var copy = answers.slice();
      await store.update(function (state) {
        return { survey: Object.assign({}, state.survey, { answers: copy }) };
      });
      return { ok: true };
    } catch (error) {
      return failure("server");
    }
  }

  async function submit(services, store, answers, now) {
    try {
      var copy = answers.slice();
      var answer = await services.data.submitSurvey(copy);
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      var stamp = time.stamp(now);
      await store.update(function (state) {
        return { survey: Object.assign({}, state.survey, { answers: copy, completedAt: stamp }) };
      });
      return { ok: true };
    } catch (error) {
      return failure("server");
    }
  }

  Sereno.surveyService = {
    saveDraft: saveDraft,
    submit: submit
  };
})(globalThis.Sereno = globalThis.Sereno || {});

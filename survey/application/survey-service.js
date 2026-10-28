/* Survey · use cases. Classic script that registers Sereno.surveyService.
   Drafts and completion markers are local UI state, isolated by authenticated
   username. Submitted answers go only through the remote survey port.
   Status comes only from the backend; local completion markers are never
   eligibility authority. Results never throw. */

(function (Sereno) {
  "use strict";

  var time = Sereno.time;

  function failure(error) {
    return Sereno.providers.errors.failure(error);
  }

  function usernameOf(state) {
    return state && state.session && typeof state.session.username === "string" ? state.session.username : null;
  }

  function recordsOf(state) {
    var survey = state && state.survey;
    return survey && survey.byUser && typeof survey.byUser === "object" ? survey.byUser : {};
  }

  function recordFor(state, username) {
    if (!username) {
      return null;
    }
    var records = recordsOf(state);
    return Object.prototype.hasOwnProperty.call(records, username) ? records[username] : null;
  }

  /* Legacy global survey.answers/completedAt are deliberately not adopted by
     any account because their owner is ambiguous. */
  function draftFor(state, username) {
    var record = recordFor(state, username);
    return record && Array.isArray(record.answers) ? record.answers.slice() : [];
  }

  function completedAtFor(state, username) {
    var record = recordFor(state, username);
    return record && typeof record.completedAt === "string" ? record.completedAt : null;
  }

  function surveyPatch(state, username, answers, completedAt) {
    var records = Object.assign({}, recordsOf(state));
    records[username] = { answers: answers.slice(), completedAt: completedAt };
    return { survey: { byUser: records } };
  }

  async function status(services) {
    try {
      var answer = await services.survey.status();
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      if (typeof answer.submitted !== "boolean") {
        return failure("server");
      }
      return { ok: true, submitted: answer.submitted };
    } catch (error) {
      return failure("server");
    }
  }

  async function saveDraft(store, username, answers) {
    if (!username) {
      return failure("server");
    }
    try {
      var copy = answers.slice();
      var saved = await store.transact(function (state) {
        if (usernameOf(state) !== username) {
          return { result: false };
        }
        return {
          patch: surveyPatch(state, username, copy, completedAtFor(state, username)),
          result: true
        };
      });
      return saved ? { ok: true } : failure("server");
    } catch (error) {
      return failure("server");
    }
  }

  async function submit(services, store, username, answers, now) {
    if (!username) {
      return failure("server");
    }
    try {
      var before = await store.get();
      if (usernameOf(before) !== username) {
        return failure("server");
      }
      var copy = answers.slice();
      var answer = await services.survey.submit(copy);
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      var stamp = time.stamp(now);
      await store.transact(function (state) {
        if (usernameOf(state) !== username) {
          return { result: false };
        }
        return {
          patch: surveyPatch(state, username, copy, stamp),
          result: true
        };
      });
      return { ok: true };
    } catch (error) {
      return failure("server");
    }
  }

  Sereno.surveyService = {
    draftFor: draftFor,
    completedAtFor: completedAtFor,
    status: status,
    saveDraft: saveDraft,
    submit: submit
  };
})(globalThis.Sereno = globalThis.Sereno || {});

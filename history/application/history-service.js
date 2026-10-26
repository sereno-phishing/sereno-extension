/* History · use cases. Classic script that registers Sereno.historyService.
   Every use case is async, never throws, and reads or clears the history only
   through the data port (services.data, see platform/providers/ports.js).
   The backend records visits when it evaluates a site; the client never writes
   them. The domain rules (60 s dedupe, 200 cap) are applied to what the port
   returns. Results: { ok: true, ... } or { ok: false, error, message } where
   error is one of Sereno.providers.errors.CODES. */

(function (Sereno) {
  "use strict";

  var history = Sereno.history;

  function failure(error) {
    return Sereno.providers.errors.failure(error);
  }

  function isEntry(entry) {
    return !!entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.domain === "string";
  }

  /* -> { ok: true, entries } for the signed-in user, newest first. */
  async function list(services) {
    try {
      var answer = await services.data.listHistory();
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      if (!Array.isArray(answer.entries)) {
        return failure("server");
      }
      return { ok: true, entries: history.normalize(answer.entries.filter(isEntry)) };
    } catch (error) {
      return failure("server");
    }
  }

  /* Clears the signed-in user's history. -> { ok: true } */
  async function clear(services) {
    try {
      var answer = await services.data.deleteHistory();
      return answer && answer.ok ? { ok: true } : failure(answer && answer.error);
    } catch (error) {
      return failure("server");
    }
  }

  Sereno.historyService = {
    list: list,
    clear: clear
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* History · use cases. Classic script that registers Sereno.historyService.
   Every use case is async, never throws, and reads or clears the history only
   through the data port (services.data, see platform/providers/ports.js).
   The backend records visits when it evaluates a site; the client never writes
   them. The port returns backend records (model verdict + domain policy); each
   one becomes an entry with its final status (Sereno.history.toEntry) and a
   record outside the contract is left out. The domain rules (60 s dedupe, 200
   cap) are applied to those entries. The port answers "invalid" when nobody
   is signed in on the backend:
   that reads as no history (empty list, nothing to clear), not as an error.
   Results: { ok: true, ... } or { ok: false, error, message } where error is
   one of Sereno.providers.errors.CODES. */

(function (Sereno) {
  "use strict";

  var history = Sereno.history;

  function failure(error) {
    return Sereno.providers.errors.failure(error);
  }

  function signedOut(answer) {
    return !!answer && answer.ok === false && answer.error === "invalid";
  }

  function isRecord(record) {
    return !!record && typeof record === "object" && typeof record.id === "string" && typeof record.domain === "string";
  }

  function entriesOf(records) {
    return records.filter(isRecord).map(history.toEntry).filter(Boolean);
  }

  /* -> { ok: true, entries } for the signed-in user, newest first. */
  async function list(services) {
    try {
      var answer = await services.data.listHistory();
      if (signedOut(answer)) {
        return { ok: true, entries: [] };
      }
      if (!answer || !answer.ok) {
        return failure(answer && answer.error);
      }
      if (!Array.isArray(answer.entries)) {
        return failure("server");
      }
      return { ok: true, entries: history.normalize(entriesOf(answer.entries)) };
    } catch (error) {
      return failure("server");
    }
  }

  /* Clears the signed-in user's history. -> { ok: true } */
  async function clear(services) {
    try {
      var answer = await services.data.deleteHistory();
      return (answer && answer.ok) || signedOut(answer) ? { ok: true } : failure(answer && answer.error);
    } catch (error) {
      return failure("server");
    }
  }

  Sereno.historyService = {
    list: list,
    clear: clear
  };
})(globalThis.Sereno = globalThis.Sereno || {});

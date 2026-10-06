/* History: the per-user list of evaluated sites. Classic script that
   registers Sereno.history. Pure: ids and stamps are passed in. */

(function (Sereno) {
  "use strict";

  /* The same domain with the same verdict within this window is one visit. */
  var DEDUPE_WINDOW_MS = 60000;
  /* Newest entries kept per user. */
  var CAPACITY = 200;
  var ALL = "todas";

  function entriesOf(historyByUser, username) {
    return historyByUser && username && historyByUser[username] ? historyByUser[username] : [];
  }

  function createRecord(entry, id, stamp) {
    return {
      id: id,
      domain: entry.domain,
      status: entry.status,
      score: entry.score,
      source: entry.source || "modelo",
      ts: stamp,
      latencyMs: entry.latencyMs === undefined ? null : entry.latencyMs
    };
  }

  function isDuplicate(candidate, record, recordMs) {
    if (candidate.domain !== record.domain || candidate.status !== record.status) {
      return false;
    }
    var candidateMs = Date.parse(candidate.ts);
    return !isNaN(recordMs) && !isNaN(candidateMs) && Math.abs(candidateMs - recordMs) <= DEDUPE_WINDOW_MS;
  }

  /* Puts the record first, replacing the first duplicate visit, and keeps the
     newest CAPACITY entries. Returns a new list. */
  function append(list, record) {
    var next = (list || []).slice();
    var recordMs = Date.parse(record.ts);
    for (var index = 0; index < next.length; index += 1) {
      if (isDuplicate(next[index], record, recordMs)) {
        next.splice(index, 1);
        break;
      }
    }
    next.unshift(record);
    return next.slice(0, CAPACITY);
  }

  /* Filter ids: "todas" or a final verdict status. */
  function filterIds() {
    return [ALL].concat(Sereno.verdict.VERDICTS);
  }

  function filter(list, filterId) {
    if (filterId === ALL) {
      return list;
    }
    return list.filter(function (entry) {
      return entry.status === filterId;
    });
  }

  function findById(list, id) {
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].id === id) {
        return list[index];
      }
    }
    return null;
  }

  Sereno.history = {
    DEDUPE_WINDOW_MS: DEDUPE_WINDOW_MS,
    CAPACITY: CAPACITY,
    ALL: ALL,
    entriesOf: entriesOf,
    createRecord: createRecord,
    append: append,
    filterIds: filterIds,
    filter: filter,
    findById: findById
  };
})(globalThis.Sereno = globalThis.Sereno || {});

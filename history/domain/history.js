/* History: the per-user list of evaluated sites. Classic script that
   registers Sereno.history. Pure: ids and stamps are passed in.
   Two shapes live here:
     record  what the backend stores and serves
             { id, domain, verdict, policy, score, source, ts, latencyMs }
             verdict is the model class, policy the one in force when served
     entry   what the views read, with the policy already applied (toEntry)
             { id, domain, status, score, source, ts, latencyMs } */

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

  /* The record a backend keeps for an evaluated site. */
  function createRecord(result, id, stamp) {
    return {
      id: id,
      domain: result.domain,
      verdict: result.verdict,
      policy: result.policy,
      score: result.score,
      source: result.source || "modelo",
      ts: stamp,
      latencyMs: result.latencyMs === undefined ? null : result.latencyMs
    };
  }

  /* The entry the views read for a backend record: the domain policy is
     applied here, once. Null when the record is outside the contract. */
  function toEntry(record) {
    if (!record || typeof record !== "object") {
      return null;
    }
    var status = Sereno.verdict.applyPolicy(record.verdict, record.policy);
    if (!status) {
      return null;
    }
    return {
      id: record.id,
      domain: record.domain,
      status: status,
      score: record.score,
      source: record.source || "modelo",
      ts: record.ts,
      latencyMs: record.latencyMs === undefined ? null : record.latencyMs
    };
  }

  /* Same result for the site: records compare by verdict and policy, entries
     by status (the fields of the other shape are absent on both sides). */
  function sameResult(left, right) {
    return left.status === right.status && left.verdict === right.verdict && left.policy === right.policy;
  }

  function isDuplicate(candidate, record, recordMs) {
    if (candidate.domain !== record.domain || !sameResult(candidate, record)) {
      return false;
    }
    var candidateMs = Date.parse(candidate.ts);
    return !isNaN(recordMs) && !isNaN(candidateMs) && Math.abs(candidateMs - recordMs) <= DEDUPE_WINDOW_MS;
  }

  /* Puts the record first, replacing the first duplicate visit, and keeps the
     newest CAPACITY entries. Returns a new list. Works on a list of records
     or on a list of entries. */
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

  /* Applies the dedupe window and the capacity to a list that arrives from
     outside (newest first), so the rules hold whoever stored it. */
  function normalize(list) {
    var result = [];
    (list || []).slice().reverse().forEach(function (record) {
      result = append(result, record);
    });
    return result;
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
    toEntry: toEntry,
    append: append,
    normalize: normalize,
    filterIds: filterIds,
    filter: filter,
    findById: findById
  };
})(globalThis.Sereno = globalThis.Sereno || {});

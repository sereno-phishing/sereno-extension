/* History · use cases. Classic script that registers Sereno.historyService.
   Each use case receives the state store port and the current Date. */

(function (Sereno) {
  "use strict";

  var history = Sereno.history;
  var time = Sereno.time;

  function newId(now) {
    return "h-" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function withList(state, username, list) {
    var byUser = Object.assign({}, state.history);
    byUser[username] = list;
    return { history: byUser };
  }

  /* Appends a visit to the user's history (deduplicated and capped by the domain rules). */
  function append(store, username, entry, now) {
    return store.update(function (state) {
      var record = history.createRecord(entry, entry.id || newId(now), entry.ts || time.stamp(now));
      return withList(state, username, history.append(history.entriesOf(state.history, username), record));
    });
  }

  /* Appends the visit for whoever is signed in; anonymous visits are not kept. */
  function recordVisit(store, entry, now) {
    return store.get().then(function (state) {
      var session = state ? state.session : null;
      if (!session || !session.username) {
        return undefined;
      }
      return append(store, session.username, entry, now);
    });
  }

  function clear(store, username) {
    return store.update(function (state) {
      return withList(state, username, []);
    });
  }

  Sereno.historyService = {
    append: append,
    recordVisit: recordVisit,
    clear: clear
  };
})(globalThis.Sereno = globalThis.Sereno || {});

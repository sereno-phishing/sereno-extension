/* Account · use cases. Classic script that registers Sereno.accountService.
   Each use case receives the state store port and the current Date. */

(function (Sereno) {
  "use strict";

  var account = Sereno.account;
  var time = Sereno.time;

  /* -> { ok: true, user } or { ok: false, error: "invalid" } */
  function login(store, username, password, now) {
    return store.transact(function (state) {
      var outcome = account.authenticate(state.users, username, password);
      if (!outcome.ok) {
        return { result: outcome };
      }
      return {
        patch: { session: account.openSession(outcome.user, time.stamp(now)) },
        result: { ok: true, user: account.publicUser(outcome.user) }
      };
    });
  }

  /* Creates the account and signs it in. -> { ok: true } or { ok: false, error: "duplicate" } */
  function register(store, username, password, now) {
    return store.transact(function (state) {
      var stamp = time.stamp(now);
      var outcome = account.createUser(state.users, username, password, stamp);
      if (!outcome.ok) {
        return { result: outcome };
      }
      return {
        patch: { users: state.users.concat([outcome.user]), session: account.openSession(outcome.user, stamp) },
        result: { ok: true }
      };
    });
  }

  function logout(store) {
    return store.set({ session: null });
  }

  Sereno.accountService = {
    login: login,
    register: register,
    logout: logout
  };
})(globalThis.Sereno = globalThis.Sereno || {});

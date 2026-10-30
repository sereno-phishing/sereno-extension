/* Account · use cases. Classic script that registers Sereno.accountService.
   Every use case is async, never throws, and talks to the backend only through
   the auth port (services.auth, see platform/providers/ports.js). The password
   goes to the port and is dropped: the state store keeps only the sanitized
   user and the opaque session token.
   Results: { ok: true, ... } or { ok: false, error, message } where error is
   one of Sereno.account.ERRORS. */

(function (Sereno) {
  "use strict";

  var account = Sereno.account;
  var time = Sereno.time;

  function failure(error, kind) {
    var code = account.ERRORS.indexOf(error) >= 0 ? error : "server";
    return { ok: false, error: code, message: account.errorMessage(code, kind) };
  }

  function isUser(user) {
    return !!user && typeof user === "object" && typeof user.username === "string" && typeof user.isAdmin === "boolean";
  }

  /* Remote auth owns credentials. Remove legacy mock credentials and sessions
     before any auth operation, including unsuccessful requests. */
  async function prepareStore(services, store) {
    if (services.auth.remote) {
      await store.update(function (state) {
        var session = state.session;
        var legacy = session && (!session.token || String(session.token).indexOf("mock-") === 0);
        return Object.assign({ users: [] }, legacy ? { session: null } : {});
      });
    }
  }

  /* Shared by login and register: both end with a signed-in user. */
  async function signIn(kind, services, store, username, password, now) {
    try {
      await prepareStore(services, store);
      var valid = account.validateCredentials(username, password);
      if (!valid.ok) {
        return failure(valid.error, kind);
      }
      var answer = await services.auth[kind](username, password);
      if (!answer || !answer.ok) {
        return failure(answer && answer.error, kind);
      }
      if (!isUser(answer.user)) {
        return failure("server", kind);
      }
      var user = account.publicUser(answer.user);
      var session = account.openSession(user, answer.token, time.stamp(now));
      await store.set({ session: session });
      return { ok: true, user: user, token: session.token };
    } catch (error) {
      return failure("server", kind);
    }
  }

  function login(services, store, username, password, now) {
    return signIn("login", services, store, username, password, now);
  }

  /* Creates the account; the provider signs the new user in. */
  function register(services, store, username, password, now) {
    return signIn("register", services, store, username, password, now);
  }

  /* The user always leaves locally, even when the backend cannot be reached.
     -> { ok: true, synced } where synced says if the backend acknowledged. */
  async function logout(services, store) {
    var synced = false;
    try {
      await prepareStore(services, store);
      var answer = await services.auth.logout();
      synced = !!(answer && answer.ok);
    } catch (error) {
      synced = false;
    }
    try {
      await store.set({ session: null });
      return { ok: true, synced: synced };
    } catch (error) {
      return failure("server");
    }
  }

  /* The stored session, checked against the backend when it answers. Offline
     or failing backends keep the local session (verified: false).
     -> { ok: true, session | null, verified } */
  async function currentSession(services, store) {
    try {
      await prepareStore(services, store);
      var state = await store.get();
      var local = state.session || null;
      var answer = null;
      try {
        answer = await services.auth.session();
      } catch (error) {
        answer = null;
      }
      if (!answer || !answer.ok) {
        return { ok: true, session: local, verified: false };
      }
      if (!answer.session) {
        if (local) {
          await store.set({ session: null });
        }
        return { ok: true, session: null, verified: true };
      }
      if (!isUser(answer.session)) {
        return failure("server");
      }
      var adopted = account.openSession(answer.session, answer.session.token, answer.session.loginAt);
      await store.set({ session: adopted });
      return { ok: true, session: adopted, verified: true };
    } catch (error) {
      return failure("server");
    }
  }

  Sereno.accountService = {
    login: login,
    register: register,
    logout: logout,
    currentSession: currentSession
  };
})(globalThis.Sereno = globalThis.Sereno || {});

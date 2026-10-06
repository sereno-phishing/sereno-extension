/* Account: users, credentials check, registration and roles. Classic script
   that registers Sereno.account. Pure: callers pass the user list and the
   current stamp; nothing here reads storage or the clock. */

(function (Sereno) {
  "use strict";

  var ROLES = { USER: "usuario", ADMIN: "administrador" };

  function findUser(users, username) {
    var found = null;
    (users || []).forEach(function (user) {
      if (user.username === username) {
        found = user;
      }
    });
    return found;
  }

  function publicUser(user) {
    return { username: user.username, role: user.role, createdAt: user.createdAt };
  }

  function openSession(user, stamp) {
    return { username: user.username, role: user.role, loginAt: stamp };
  }

  /* -> { ok: true, user } or { ok: false, error: "invalid" } */
  function authenticate(users, username, password) {
    var user = findUser(users, username);
    if (!user || user.password !== password) {
      return { ok: false, error: "invalid" };
    }
    return { ok: true, user: user };
  }

  /* New accounts always get the plain user role.
     -> { ok: true, user } or { ok: false, error: "duplicate" } */
  function createUser(users, username, password, stamp) {
    if (findUser(users, username)) {
      return { ok: false, error: "duplicate" };
    }
    return { ok: true, user: { username: username, password: password, role: ROLES.USER, createdAt: stamp } };
  }

  function isAdmin(session) {
    return !!(session && session.role === ROLES.ADMIN);
  }

  function roleTitle(role) {
    return role === ROLES.ADMIN ? "Administrador" : role;
  }

  /* Two-letter avatar text: first letters of the first two name parts. */
  function initials(username) {
    var name = String(username || "").trim();
    if (!name) {
      return "?";
    }
    var parts = name.split(/[.\s_-]+/).filter(function (part) {
      return part.length > 0;
    });
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  Sereno.account = {
    ROLES: ROLES,
    findUser: findUser,
    publicUser: publicUser,
    openSession: openSession,
    authenticate: authenticate,
    createUser: createUser,
    isAdmin: isAdmin,
    roleTitle: roleTitle,
    initials: initials
  };
})(globalThis.Sereno = globalThis.Sereno || {});

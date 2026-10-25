/* Account: roles, session shape, credential FORMAT rules and error messages.
   Classic script that registers Sereno.account. Pure and password-free: the
   domain never compares or stores a password, the auth provider (the backend)
   verifies credentials. Callers pass the current stamp; nothing here reads
   storage or the clock. */

(function (Sereno) {
  "use strict";

  var ROLES = { USER: "usuario", ADMIN: "administrador" };

  /* Every failure an account use case can report. */
  var ERRORS = ["invalid", "duplicate", "timeout", "offline", "server"];

  var MESSAGES = {
    invalid: "Usuario o contraseña incorrectos.",
    duplicate: "El usuario ya existe.",
    timeout: "El servidor tardó demasiado en responder. Inténtalo de nuevo.",
    offline: "Sin conexión. Revisa tu red e inténtalo de nuevo.",
    server: "El servidor no está disponible. Inténtalo más tarde."
  };
  var REGISTER_INVALID = "Ingresa un usuario y una contraseña válidos.";

  function findUser(users, username) {
    var found = null;
    (users || []).forEach(function (user) {
      if (user.username === username) {
        found = user;
      }
    });
    return found;
  }

  /* Whitelist copy: whatever else a record carries never leaves through here. */
  function publicUser(user) {
    return { username: user.username, role: user.role, createdAt: user.createdAt };
  }

  /* The stored session: sanitized user plus the opaque token the provider issued. */
  function openSession(user, token, stamp) {
    return {
      username: user.username,
      role: user.role,
      loginAt: stamp,
      token: typeof token === "string" && token ? token : null
    };
  }

  /* A new account always gets the plain user role. */
  function newUser(username, stamp) {
    return { username: username, role: ROLES.USER, createdAt: stamp };
  }

  /* Format only (non-empty strings); the provider decides if they are right.
     -> { ok: true } or { ok: false, error: "invalid" } */
  function validateCredentials(username, password) {
    var validName = typeof username === "string" && username.trim().length > 0;
    var validPassword = typeof password === "string" && password.length > 0;
    return validName && validPassword ? { ok: true } : { ok: false, error: "invalid" };
  }

  /* Spanish text for an error code; unknown codes read as a server problem.
     kind: "login" (default) or "register". */
  function errorMessage(error, kind) {
    var code = ERRORS.indexOf(error) >= 0 ? error : "server";
    if (code === "invalid" && kind === "register") {
      return REGISTER_INVALID;
    }
    return MESSAGES[code];
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
    ERRORS: ERRORS,
    findUser: findUser,
    publicUser: publicUser,
    openSession: openSession,
    newUser: newUser,
    validateCredentials: validateCredentials,
    errorMessage: errorMessage,
    isAdmin: isAdmin,
    roleTitle: roleTitle,
    initials: initials
  };
})(globalThis.Sereno = globalThis.Sereno || {});

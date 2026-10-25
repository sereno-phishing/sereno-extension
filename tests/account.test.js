"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { account } = load("account/domain/account.js");

const ADMIN = { username: "admin.sereno", role: "administrador", createdAt: "2026-09-01T10:00:00" };
const USER = { username: "andres.torres", role: "usuario", createdAt: "2026-09-01T10:00:00" };

test("the domain handles no passwords: no credential comparison, no stored secret", () => {
  assert.equal(account.authenticate, undefined);
  assert.equal(account.createUser, undefined);
  assert.deepEqual(account.newUser("nuevo", "2026-09-21T10:00"), {
    username: "nuevo",
    role: "usuario",
    createdAt: "2026-09-21T10:00"
  });
});

test("validateCredentials checks only the format of username and password", () => {
  assert.deepEqual(account.validateCredentials("andres.torres", "x"), { ok: true });
  assert.deepEqual(account.validateCredentials("", "x"), { ok: false, error: "invalid" });
  assert.deepEqual(account.validateCredentials("   ", "x"), { ok: false, error: "invalid" });
  assert.deepEqual(account.validateCredentials("andres.torres", ""), { ok: false, error: "invalid" });
  assert.deepEqual(account.validateCredentials(undefined, undefined), { ok: false, error: "invalid" });
  assert.deepEqual(account.validateCredentials(42, "x"), { ok: false, error: "invalid" });
});

test("session carries the sanitized user and the opaque token", () => {
  assert.deepEqual(account.openSession(ADMIN, "tok-1", "2026-09-21T10:00"), {
    username: "admin.sereno",
    role: "administrador",
    loginAt: "2026-09-21T10:00",
    token: "tok-1"
  });
  const leaky = Object.assign({ password: "secret" }, USER);
  assert.deepEqual(account.publicUser(leaky), USER);
  assert.equal("password" in account.openSession(leaky, "t", "s"), false);
  assert.equal(account.openSession(USER, undefined, "s").token, null);
});

test("roles and lookup", () => {
  assert.equal(account.isAdmin({ role: "administrador" }), true);
  assert.equal(account.isAdmin({ role: "usuario" }), false);
  assert.equal(account.isAdmin(null), false);
  assert.equal(account.roleTitle("administrador"), "Administrador");
  assert.equal(account.roleTitle("usuario"), "usuario");
  assert.equal(account.findUser([USER, ADMIN], "ghost"), null);
  assert.equal(account.findUser([USER, ADMIN], "admin.sereno"), ADMIN);
});

test("error codes map to Spanish messages and unknown codes fall back to server", () => {
  assert.deepEqual(account.ERRORS, ["invalid", "duplicate", "timeout", "offline", "server"]);
  assert.equal(account.errorMessage("invalid", "login"), "Usuario o contraseña incorrectos.");
  assert.equal(account.errorMessage("invalid", "register"), "Ingresa un usuario y una contraseña válidos.");
  assert.equal(account.errorMessage("duplicate", "register"), "El usuario ya existe.");
  assert.match(account.errorMessage("timeout", "login"), /tard/);
  assert.match(account.errorMessage("offline", "login"), /conexión/);
  assert.match(account.errorMessage("server", "login"), /servidor/);
  assert.equal(account.errorMessage("weird", "login"), account.errorMessage("server", "login"));
  assert.equal(account.errorMessage(undefined), account.errorMessage("server"));
});

test("initials use the first two name parts", () => {
  assert.equal(account.initials("andres.torres"), "AT");
  assert.equal(account.initials("nuevo_usuario-x"), "NU");
  assert.equal(account.initials("maria"), "MA");
  assert.equal(account.initials("  "), "?");
  assert.equal(account.initials(undefined), "?");
});

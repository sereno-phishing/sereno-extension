"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { account } = load("account/domain/account.js");

const USERS = [
  { username: "andres.torres", password: "sereno123", role: "usuario", createdAt: "2026-09-01T10:00:00" },
  { username: "admin.sereno", password: "sereno123", role: "administrador", createdAt: "2026-09-01T10:00:00" }
];

test("authenticate accepts only the exact username and password", () => {
  assert.equal(account.authenticate(USERS, "andres.torres", "sereno123").ok, true);
  assert.equal(account.authenticate(USERS, "andres.torres", "sereno123").user.role, "usuario");
  assert.deepEqual(account.authenticate(USERS, "andres.torres", "nope"), { ok: false, error: "invalid" });
  assert.deepEqual(account.authenticate(USERS, "Andres.Torres", "sereno123"), { ok: false, error: "invalid" });
  assert.deepEqual(account.authenticate(USERS, "ghost", "sereno123"), { ok: false, error: "invalid" });
});

test("createUser rejects duplicates and always assigns the user role", () => {
  assert.deepEqual(account.createUser(USERS, "admin.sereno", "x", "2026-09-21T10:00"), { ok: false, error: "duplicate" });
  assert.deepEqual(account.createUser(USERS, "nuevo", "abc", "2026-09-21T10:00"), {
    ok: true,
    user: { username: "nuevo", password: "abc", role: "usuario", createdAt: "2026-09-21T10:00" }
  });
});

test("session, public user and roles", () => {
  assert.deepEqual(account.openSession(USERS[1], "2026-09-21T10:00"), {
    username: "admin.sereno",
    role: "administrador",
    loginAt: "2026-09-21T10:00"
  });
  assert.deepEqual(account.publicUser(USERS[0]), { username: "andres.torres", role: "usuario", createdAt: "2026-09-01T10:00:00" });
  assert.equal(account.isAdmin({ role: "administrador" }), true);
  assert.equal(account.isAdmin({ role: "usuario" }), false);
  assert.equal(account.isAdmin(null), false);
  assert.equal(account.roleTitle("administrador"), "Administrador");
  assert.equal(account.roleTitle("usuario"), "usuario");
  assert.equal(account.findUser(USERS, "ghost"), null);
});

test("initials use the first two name parts", () => {
  assert.equal(account.initials("andres.torres"), "AT");
  assert.equal(account.initials("nuevo_usuario-x"), "NU");
  assert.equal(account.initials("maria"), "MA");
  assert.equal(account.initials("  "), "?");
  assert.equal(account.initials(undefined), "?");
});

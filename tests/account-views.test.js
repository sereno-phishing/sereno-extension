"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const Sereno = load("ui/atoms.js", "ui/molecules.js", "account/domain/account.js", "account/ui/account-views.js");
const { accountUi } = Sereno;

test("login and register keep their classic messages when the error has no code", () => {
  assert.match(accountUi.loginView({ error: true, username: "u", password: "p" }), /Usuario o contraseña incorrectos\./);
  const register = accountUi.registerView({ error: true, username: "u", password: "p" });
  assert.match(register, /El usuario ya existe\./);
  assert.match(register, /Elige otro nombre de usuario\./);
  assert.doesNotMatch(accountUi.loginView({ error: false }), /role="alert"/);
});

test("transport error codes show their own message", () => {
  assert.match(accountUi.loginView({ error: true, errorCode: "offline" }), /Sin conexión/);
  assert.match(accountUi.loginView({ error: true, errorCode: "timeout" }), /tardó demasiado/);
  assert.match(accountUi.loginView({ error: true, errorCode: "server" }), /servidor no está disponible/);
});

test("register marks the username field only for a duplicate", () => {
  const offline = accountUi.registerView({ error: true, errorCode: "offline", username: "u" });
  assert.match(offline, /Sin conexión/);
  assert.doesNotMatch(offline, /Elige otro nombre de usuario\./);
  const duplicate = accountUi.registerView({ error: true, errorCode: "duplicate", username: "u" });
  assert.match(duplicate, /Elige otro nombre de usuario\./);
  assert.match(accountUi.registerView({ error: true, errorCode: "invalid" }), /usuario y una contraseña válidos/);
});

test("accountMenu keeps its default contract and can omit only the survey entry", () => {
  const user = { username: "ana", role: "usuario" };
  const admin = { username: "admin", role: "administrador" };
  const defaultMenu = accountUi.accountMenu(user);
  assert.equal(accountUi.accountMenu(user, {}), defaultMenu);
  assert.match(defaultMenu, /data-action="open-survey"[^>]*>Encuesta de opinión/);
  assert.match(defaultMenu, /data-action="logout"[^>]*>Cerrar sesión/);

  const completedUser = accountUi.accountMenu(user, { showSurvey: false });
  assert.doesNotMatch(completedUser, /open-survey|Encuesta de opinión/);
  assert.match(completedUser, /data-action="logout"[^>]*>Cerrar sesión/);

  const completedAdmin = accountUi.accountMenu(admin, { showSurvey: false });
  assert.doesNotMatch(completedAdmin, /open-survey|Encuesta de opinión/);
  assert.match(completedAdmin, /data-action="open-admin"[^>]*>Panel de administración/);
  assert.match(completedAdmin, /data-action="logout"[^>]*>Cerrar sesión/);
});

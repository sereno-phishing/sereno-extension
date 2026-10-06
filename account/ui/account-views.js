/* Account · presentational views: sign-in and sign-up forms, the header
   account button and the account menu. Classic script that registers
   Sereno.accountUi. Plain data in, HTML out. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var account = Sereno.account;

  /* Shared template of both credential forms.
     options: { kind, title, sub, error, fields, submitLabel, switchPrompt, switchAction, switchLabel } */
  function credentialsForm(options) {
    return (
      '<section class="view view-form">' +
      '<button type="button" class="back-link" data-action="auth-back">← Volver al inicio</button>' +
      '<h1 class="view-title">' + ui.esc(options.title) + "</h1>" +
      '<p class="view-sub">' + ui.esc(options.sub) + "</p>" +
      '<form class="form" data-form="' + options.kind + '" novalidate>' +
      (options.error ? ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: options.error }) : "") +
      options.fields.map(ui.field).join("") +
      ui.button({ type: "submit", label: options.submitLabel, variant: "primary", block: true }) +
      "</form>" +
      '<p class="center-note"><span>' + ui.esc(options.switchPrompt) + "</span>" +
      '<button type="button" class="link-btn" data-action="' + options.switchAction + '">' + ui.esc(options.switchLabel) +
      "</button></p></section>"
    );
  }

  function usernameField(options) {
    return Object.assign({ label: "Usuario", name: "username", type: "text", placeholder: "nombre de usuario" }, options);
  }

  function passwordField(options) {
    return Object.assign({ label: "Contraseña", name: "password", type: "password" }, options);
  }

  /* model: { error, username, password } — the draft is shown again only after an error. */
  function loginView(model) {
    return credentialsForm({
      kind: "login",
      title: "Inicia sesión",
      sub: "Accede a tu historial de sitios evaluados.",
      error: model.error ? "Usuario o contraseña incorrectos." : "",
      fields: [
        usernameField({ value: model.error ? model.username : "" }),
        passwordField({ hasError: model.error, value: model.error ? model.password : "" })
      ],
      submitLabel: "Iniciar sesión",
      switchPrompt: "¿No tienes cuenta?",
      switchAction: "go-register",
      switchLabel: "Crea una"
    });
  }

  /* model: { error, username, password } — error means the username is taken. */
  function registerView(model) {
    return credentialsForm({
      kind: "register",
      title: "Crea tu cuenta",
      sub: "Guarda tu historial y úsalo en otros dispositivos.",
      error: model.error ? "El usuario ya existe." : "",
      fields: [
        usernameField({
          hasError: model.error,
          help: model.error ? "Elige otro nombre de usuario." : "",
          helpIsError: true,
          value: model.error ? model.username : ""
        }),
        passwordField({ help: "Se guarda cifrada. No pedimos tu correo.", value: model.error ? model.password : "" })
      ],
      submitLabel: "Crear cuenta",
      switchPrompt: "¿Ya tienes cuenta?",
      switchAction: "go-login",
      switchLabel: "Inicia sesión"
    });
  }

  /* Header button that opens the account menu: "Admin" pill or the user's initials. */
  function accountButton(session) {
    if (account.isAdmin(session)) {
      return '<button type="button" class="admin-pill" data-action="toggle-menu" aria-haspopup="menu">Admin</button>';
    }
    return (
      '<button type="button" class="avatar" data-action="toggle-menu" aria-haspopup="menu" ' +
      'aria-label="Cuenta de ' + ui.esc(session.username) + '">' + ui.esc(account.initials(session.username)) + "</button>"
    );
  }

  function menuItem(action, label, danger) {
    return (
      '<button type="button" class="' + ui.classes(["menu-item", danger && "menu-item-danger"]) + '" role="menuitem" ' +
      'data-action="' + action + '">' + ui.esc(label) + "</button>"
    );
  }

  var SEPARATOR = '<div class="menu-sep"></div>';

  function accountMenu(session) {
    return (
      '<div class="menu-overlay" data-action="close-menu">' +
      '<div class="account-menu" role="menu" aria-label="Cuenta">' +
      '<div class="menu-head"><div class="menu-user">' + ui.esc(session.username) + "</div>" +
      '<div class="menu-role">Rol: ' + ui.esc(session.role) + "</div></div>" +
      (account.isAdmin(session) ? menuItem("open-admin", "Panel de administración") : "") +
      SEPARATOR + menuItem("open-survey", "Encuesta de opinión") +
      SEPARATOR + menuItem("logout", "Cerrar sesión", true) +
      "</div></div>"
    );
  }

  Sereno.accountUi = {
    loginView: loginView,
    registerView: registerView,
    accountButton: accountButton,
    accountMenu: accountMenu
  };
})(globalThis.Sereno = globalThis.Sereno || {});

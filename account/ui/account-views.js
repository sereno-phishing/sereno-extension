/* Account · presentational views: sign-in and sign-up forms, the header
   account button and the account menu. Classic script that registers
   Sereno.accountUi. Plain data in, HTML out. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var account = Sereno.account;
  var messages = {
    back: ["Volver al inicio", "Back to home"], username: ["Usuario", "Username"],
    placeholder: ["nombre de usuario", "username"], password: ["Contraseña", "Password"],
    login: ["Inicia sesión", "Sign in"], loginSub: ["Accede a tu historial de sitios evaluados.", "Access your history of evaluated sites."],
    loginButton: ["Iniciar sesión", "Sign in"], noAccount: ["¿No tienes cuenta?", "Don't have an account?"],
    createOne: ["Crea una", "Create one"], register: ["Crea tu cuenta", "Create your account"],
    registerSub: ["Guarda tu historial y úsalo en otros dispositivos.", "Save your history and use it on other devices."],
    chooseUsername: ["Elige otro nombre de usuario.", "Choose another username."],
    passwordHelp: ["Se guarda cifrada. No pedimos tu correo.", "It is stored encrypted. We do not ask for your email."],
    createAccount: ["Crear cuenta", "Create account"], hasAccount: ["¿Ya tienes cuenta?", "Already have an account?"],
    accountOf: ["Cuenta de ", "Account of "], account: ["Cuenta", "Account"], role: ["Rol: ", "Role: "],
    roleAdmin: ["Administrador", "Administrator"], roleUser: ["Usuario", "User"],
    survey: ["Encuesta de opinión", "Feedback survey"], admin: ["Panel de administración", "Administration panel"],
    logout: ["Cerrar sesión", "Sign out"],
    invalid: ["Usuario o contraseña incorrectos.", "Incorrect username or password."],
    registerInvalid: ["Ingresa un usuario y una contraseña válidos.", "Enter a valid username and password."],
    duplicate: ["El usuario ya existe.", "The username already exists."],
    timeout: ["El servidor tardó demasiado en responder. Inténtalo de nuevo.", "The server took too long to respond. Try again."],
    offline: ["Sin conexión. Revisa tu red e inténtalo de nuevo.", "Offline. Check your connection and try again."],
    server: ["El servidor no está disponible. Inténtalo más tarde.", "The server is unavailable. Try again later."]
  };
  if (Sereno.i18n && Sereno.i18n.register) {
    var catalog = {};
    Object.keys(messages).forEach(function (key) { catalog["account." + key] = { es: messages[key][0], en: messages[key][1] }; });
    Sereno.i18n.register(catalog);
  }
  function t(key) { return Sereno.i18n && Sereno.i18n.t ? Sereno.i18n.t("account." + key) : messages[key][0]; }
  function errorText(code, kind) {
    var key = account.ERRORS.indexOf(code) < 0 ? "server" : code;
    return t(key === "invalid" && kind === "register" ? "registerInvalid" : key);
  }

  /* Shared template of both credential forms.
     options: { kind, title, sub, error, fields, submitLabel, switchPrompt, switchAction, switchLabel } */
  function credentialsForm(options) {
    return (
      '<section class="view view-form">' +
      '<button type="button" class="back-link" data-action="auth-back">← ' + t("back") + '</button>' +
      '<h1 class="view-title">' + ui.esc(options.title) + "</h1>" +
      '<p class="view-sub">' + ui.esc(options.sub) + "</p>" +
      '<form class="form" data-form="' + options.kind + '" novalidate>' +
      (options.error ? ui.banner({ tone: "error", role: "alert", id: "form-error", iconHtml: ui.art("bad", "16"), text: options.error }) : "") +
      options.fields.map(ui.field).join("") +
      ui.button({ type: "submit", label: options.submitLabel, variant: "primary", block: true }) +
      "</form>" +
      '<p class="center-note"><span>' + ui.esc(options.switchPrompt) + "</span>" +
      '<button type="button" class="link-btn" data-action="' + options.switchAction + '">' + ui.esc(options.switchLabel) +
      "</button></p></section>"
    );
  }

  var FORM_ERROR = "form-error";

  function usernameField(options) {
    return Object.assign({ label: t("username"), name: "username", type: "text", placeholder: t("placeholder"), autocomplete: "username" }, options);
  }

  function passwordField(options) {
    return Object.assign({ label: t("password"), name: "password", type: "password" }, options);
  }

  /* model: { error, errorCode?, username, password } — the draft is shown again only after an error.
     errorCode is one of Sereno.account.ERRORS and picks the message; "invalid" when absent. */
  function loginView(model) {
    var wrong = model.error && (model.errorCode || "invalid") === "invalid";
    var describedBy = model.error ? FORM_ERROR : "";
    return credentialsForm({
      kind: "login",
      title: t("login"),
      sub: t("loginSub"),
      error: model.error ? errorText(model.errorCode || "invalid", "login") : "",
      fields: [
        usernameField({ invalid: wrong, describedBy: describedBy, value: model.error ? model.username : "" }),
        passwordField({ hasError: model.error, invalid: wrong, describedBy: describedBy, autocomplete: "current-password", value: model.error ? model.password : "" })
      ],
      submitLabel: t("loginButton"),
      switchPrompt: t("noAccount"),
      switchAction: "go-register",
      switchLabel: t("createOne")
    });
  }

  /* model: { error, errorCode?, username, password } — error without errorCode means the username is taken.
     Only "duplicate" marks the username field; other codes (offline, timeout, server, invalid) show the banner. */
  function registerView(model) {
    var taken = model.error && (!model.errorCode || model.errorCode === "duplicate");
    var describedBy = model.error ? FORM_ERROR : "";
    return credentialsForm({
      kind: "register",
      title: t("register"),
      sub: t("registerSub"),
      error: model.error ? errorText(model.errorCode || "duplicate", "register") : "",
      fields: [
        usernameField({
          hasError: taken,
          help: taken ? t("chooseUsername") : "",
          helpIsError: true,
          describedBy: describedBy,
          value: model.error ? model.username : ""
        }),
        passwordField({ help: t("passwordHelp"), autocomplete: "new-password", describedBy: describedBy, value: model.error ? model.password : "" })
      ],
      submitLabel: t("createAccount"),
      switchPrompt: t("hasAccount"),
      switchAction: "go-login",
      switchLabel: t("login")
    });
  }

  /* Header button that opens the account menu: "Admin" pill or the user's initials.
     open: whether the menu is showing (aria-expanded). */
  function accountButton(session, open) {
    var expanded = ' aria-expanded="' + !!open + '"';
    if (account.isAdmin(session)) {
      return '<button type="button" class="admin-pill" data-action="toggle-menu" aria-haspopup="menu"' + expanded + ">Admin</button>";
    }
    return (
      '<button type="button" class="avatar" data-action="toggle-menu" aria-haspopup="menu"' + expanded + ' ' +
      'aria-label="' + ui.esc(t("accountOf") + session.username) + '">' + ui.esc(account.initials(session.username)) + "</button>"
    );
  }

  function menuItem(action, label, danger) {
    return (
      '<button type="button" class="' + ui.classes(["menu-item", danger && "menu-item-danger"]) + '" role="menuitem" ' +
      'data-action="' + action + '">' + ui.esc(label) + "</button>"
    );
  }

  var SEPARATOR = '<div class="menu-sep"></div>';

  function accountMenu(session, options) {
    options = options || {};
    var surveyEntry = options.showSurvey === false ? "" : SEPARATOR + menuItem("open-survey", t("survey"));
    return (
      '<div class="menu-overlay" data-action="close-menu">' +
      '<div class="account-menu" data-action="menu-content" role="menu" aria-label="' + ui.esc(t("account")) + '">' +
      '<div class="menu-head"><div class="menu-user">' + ui.esc(session.username) + "</div>" +
      '<div class="menu-role">' + t("role") + t(account.isAdmin(session) ? "roleAdmin" : "roleUser") + "</div></div>" +
      (account.isAdmin(session) ? menuItem("open-admin", t("admin")) : "") +
      surveyEntry +
      SEPARATOR + '<div role="none"><fieldset class="menu-language">' +
      '<legend>' + (options.language === "en" ? "Language" : "Idioma") + '</legend>' +
      '<div class="menu-language-choices">' +
      '<div class="menu-language-option"><input type="radio" id="language-es" name="language" value="es"' + (options.language === "en" ? "" : " checked") + '><label for="language-es" lang="es">Español</label></div>' +
      '<div class="menu-language-option"><input type="radio" id="language-en" name="language" value="en"' + (options.language === "en" ? " checked" : "") + '><label for="language-en" lang="en">English</label></div>' +
      '</div></fieldset></div>' +
      SEPARATOR + menuItem("logout", t("logout"), true) +
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

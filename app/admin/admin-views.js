/* Admin panel · page template: sidebar, access gate and the composition of
   the administration sections. Classic script that registers
   Sereno.adminViews. Presentational: UI model + shared state in, HTML out. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var account = Sereno.account;
  var administrationUi = Sereno.administrationUi;
  var i18n = Sereno.i18n;
  var gateMessages = {
    "admin.gate.title": { es: "Panel de administración", en: "Administration panel" },
    "admin.gate.description": { es: "Inicia sesión con una cuenta de administrador desde el popup de Sereno para ver este panel.", en: "Sign in with an administrator account from the Sereno popup to view this panel." },
    "admin.sections": { es: "Secciones", en: "Sections" },
    "admin.metrics": { es: "Métricas", en: "Metrics" },
    "admin.domains": { es: "Política por dominio", en: "Domain policy" },
    "admin.cache": { es: "Caché", en: "Cache" },
    "admin.role": { es: "Administrador", en: "Administrator" },
    "admin.role.user": { es: "Usuario", en: "User" },
    "admin.checking": { es: "Verificando la sesión...", en: "Checking the session..." },
    "admin.skip": { es: "Saltar al contenido", en: "Skip to content" },
    "admin.title.metrics": { es: "Métricas de operación", en: "Operation metrics" },
    "admin.title.domains": { es: "Política por dominio", en: "Domain policy" },
    "admin.title.cache": { es: "Caché de veredictos", en: "Verdict cache" }
  };
  if (i18n) i18n.register(gateMessages);
  function gateText(key) {
    return i18n ? i18n.t(key) : gateMessages[key].es;
  }

  var SECTIONS = [
    { id: "metricas", label: "admin.metrics" },
    { id: "dominios", label: "admin.domains" },
    { id: "cache", label: "admin.cache" }
  ];

  function nav(activeSection) {
    return (
      '<nav class="sidebar-nav" aria-label="' + ui.esc(gateText("admin.sections")) + '">' +
      SECTIONS.map(function (item) {
        var active = activeSection === item.id;
        return (
          '<button type="button" class="' + ui.classes(["nav-item", active && "is-active"]) + '" data-action="nav" ' +
          'data-section="' + item.id + '" aria-current="' + (active ? "page" : "false") + '">' + ui.esc(gateText(item.label)) + "</button>"
        );
      }).join("") +
      "</nav>"
    );
  }

  function sidebar(activeSection, session) {
    return (
      '<aside class="sidebar">' +
      '<div class="sidebar-brand">' + ui.logo("sidebar-logo", "Sereno") + '<span class="sidebar-name">Sereno</span></div>' +
      nav(activeSection) +
      '<div class="sidebar-foot">' +
      '<div class="sidebar-user"><span class="avatar" aria-hidden="true">' + ui.esc(account.initials(session.username)) + '</span>' +
      '<div><div class="sidebar-username">' + ui.esc(session.username) + "</div>" +
      '<div class="sidebar-role">' + ui.esc(session.isAdmin === true ? gateText("admin.role") : gateText("admin.role.user")) + "</div></div></div>" +
      "</div></aside>"
    );
  }

  /* First paint, before the session and the section are known: the sidebar and a
     generic content block as skeletons. admin.html ships the same markup. */
  function loadingPage(text) {
    var skel = ui.skeleton;
    return (
      '<aside class="sidebar" aria-hidden="true">' +
      '<div class="sidebar-brand">' + skel({ shape: "circle", cls: "skeleton-logo" }) + skel({ cls: "skeleton-name" }) + "</div>" +
      '<div class="sidebar-nav">' + new Array(4).join(skel({ shape: "rect", cls: "skeleton-nav-item" })) + "</div>" +
      '<div class="sidebar-foot"><div class="sidebar-user">' + skel({ shape: "circle", cls: "skeleton-avatar" }) +
      '<div class="skeleton-user-lines">' + skel({ cls: "skeleton-user-name" }) + skel({ cls: "skeleton-user-role" }) + "</div></div></div></aside>" +
      '<main class="options-content" id="main"><p class="sr-only" role="status">' + ui.esc(text) + "</p>" +
      skel({ shape: "rect", cls: "skeleton-page-title" }) + skel({ shape: "rect", cls: "skeleton-page-card" }) + "</main>"
    );
  }

  function checkingGate() {
    return '<main class="access-gate" id="main" tabindex="-1"><div class="card panel-status" role="status">' + ui.esc(gateText("admin.checking")) + '</div></main>';
  }

  /* Shown instead of the panel when nobody, or a non-admin user, is signed in. */
  function accessGate() {
    return (
      '<main class="access-gate" id="main" tabindex="-1"><div class="card access-gate-card">' + ui.logo("access-gate-logo", "Sereno") +
      '<h1 class="access-gate-title">' + ui.esc(gateText("admin.gate.title")) + '</h1>' +
      '<p class="access-gate-text">' + ui.esc(gateText("admin.gate.description")) + "</p></div></main>"
    );
  }

  var TITLES = {
    metricas: "admin.title.metrics",
    dominios: "admin.title.domains",
    cache: "admin.title.cache"
  };

  /* "loading" or "error" while the section has not loaded; null once it has. */
  function pendingSection(model) {
    var load = (model.load || {})[model.section];
    if (!load || load.status === "ready") {
      return null;
    }
    return administrationUi.statusSection({ id: model.section, title: gateText(TITLES[model.section]), state: load.status, message: administrationUi.errorMessage ? administrationUi.errorMessage((model.loadErrors || {})[model.section], load.message) : load.message });
  }

  function section(model) {
    var pending = pendingSection(model);
    if (pending) {
      return pending;
    }
    switch (model.section) {
      case "dominios":
        return administrationUi.domainsSection({
          rows: model.domainsDraft || [],
          addPolicy: model.addPolicy,
          saved: model.domainsBanner,
          error: model.domainsError,
          errorCode: model.domainsErrorCode
        });
      case "cache":
        return administrationUi.cacheSection({ cache: model.cache, notice: model.cacheNotice, error: model.cacheError, errorCode: model.cacheErrorCode });
      default:
        return administrationUi.metricsSection({ metrics: model.metrics, showAllQueries: model.showAllQueries, enter: model.chartEnter });
    }
  }

  /* model: the admin UI state (section, drafts, notices, the data the port
     returned and the load state of each section). */
  function page(model, state) {
    if (model.authorization === "checking") {
      return checkingGate();
    }
    if ((model.authorization !== undefined && model.authorization !== "authorized") || !account.isAdmin(state.session)) {
      return accessGate();
    }
    return (
      '<a class="skip-link" href="#main">' + ui.esc(gateText("admin.skip")) + '</a>' + sidebar(model.section, state.session) +
      '<main class="options-content" id="main" tabindex="-1">' + section(model) + "</main>"
    );
  }

  Sereno.adminViews = {
    page: page,
    loadingPage: loadingPage
  };
})(globalThis.Sereno = globalThis.Sereno || {});

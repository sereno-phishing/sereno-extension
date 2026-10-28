/* Admin panel · page template: sidebar, access gate and the composition of
   the administration sections. Classic script that registers
   Sereno.adminViews. Presentational: UI model + shared state in, HTML out. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var account = Sereno.account;
  var administrationUi = Sereno.administrationUi;

  var SECTIONS = [
    { id: "metricas", label: "Métricas" },
    { id: "dominios", label: "Política por dominio" },
    { id: "cache", label: "Caché" }
  ];

  function nav(activeSection) {
    return (
      '<nav class="sidebar-nav" aria-label="Secciones">' +
      SECTIONS.map(function (item) {
        var active = activeSection === item.id;
        return (
          '<button type="button" class="' + ui.classes(["nav-item", active && "is-active"]) + '" data-action="nav" ' +
          'data-section="' + item.id + '" aria-current="' + (active ? "page" : "false") + '">' + ui.esc(item.label) + "</button>"
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
      '<div class="sidebar-user"><span class="sidebar-avatar" aria-hidden="true"></span>' +
      '<div><div class="sidebar-username">' + ui.esc(session.username) + "</div>" +
      '<div class="sidebar-role">' + ui.esc(account.roleTitle(session.role)) + "</div></div></div>" +
      "</div></aside>"
    );
  }

  function checkingGate() {
    return '<main class="access-gate" id="main" tabindex="-1"><div class="card panel-status" role="status">Verificando la sesión...</div></main>';
  }

  /* Shown instead of the panel when nobody, or a non-admin user, is signed in. */
  function accessGate() {
    return (
      '<main class="access-gate" id="main" tabindex="-1"><div class="card access-gate-card">' + ui.logo("access-gate-logo", "Sereno") +
      '<h1 class="access-gate-title">Panel de administración</h1>' +
      '<p class="access-gate-text">Inicia sesión con una cuenta de administrador desde el popup de Sereno ' +
      "para ver este panel.</p></div></main>"
    );
  }

  var TITLES = {
    metricas: "Métricas de operación",
    dominios: "Política por dominio",
    cache: "Caché de veredictos"
  };

  /* "loading" or "error" while the section has not loaded; null once it has. */
  function pendingSection(model) {
    var load = (model.load || {})[model.section];
    if (!load || load.status === "ready") {
      return null;
    }
    return administrationUi.statusSection({ id: model.section, title: TITLES[model.section], state: load.status, message: load.message });
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
          error: model.domainsError
        });
      case "cache":
        return administrationUi.cacheSection({ cache: model.cache, notice: model.cacheNotice, error: model.cacheError });
      default:
        return administrationUi.metricsSection({ metrics: model.metrics, showAllQueries: model.showAllQueries });
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
      '<a class="skip-link" href="#main">Saltar al contenido</a>' + sidebar(model.section, state.session) +
      '<main class="options-content" id="main" tabindex="-1">' + section(model) + "</main>"
    );
  }

  Sereno.adminViews = {
    page: page
  };
})(globalThis.Sereno = globalThis.Sereno || {});

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
      '<button type="button" class="sidebar-demo" data-action="open-demo">Abrir tienda de demo</button>' +
      '<div class="sidebar-user"><span class="sidebar-avatar" aria-hidden="true"></span>' +
      '<div><div class="sidebar-username">' + ui.esc(session.username) + "</div>" +
      '<div class="sidebar-role">' + ui.esc(account.roleTitle(session.role)) + "</div></div></div>" +
      "</div></aside>"
    );
  }

  /* Shown instead of the panel when nobody, or a non-admin user, is signed in. */
  function accessGate() {
    return (
      '<main class="access-gate"><div class="card access-gate-card">' + ui.logo("access-gate-logo", "Sereno") +
      '<h1 class="access-gate-title">Panel de administración</h1>' +
      '<p class="access-gate-text">Inicia sesión con una cuenta de administrador desde el popup de Sereno ' +
      "para ver este panel.</p></div></main>"
    );
  }

  function section(model, state) {
    switch (model.section) {
      case "dominios":
        return administrationUi.domainsSection({ rows: model.domainsDraft || [], addPolicy: model.addPolicy, saved: model.domainsBanner });
      case "cache":
        return administrationUi.cacheSection({ cache: state.cache, notice: model.cacheNotice });
      default:
        return administrationUi.metricsSection({ metrics: model.metrics, showAllQueries: model.showAllQueries });
    }
  }

  /* model: the admin UI state (section, drafts, notices, metrics). */
  function page(model, state) {
    if (!account.isAdmin(state.session)) {
      return accessGate();
    }
    return sidebar(model.section, state.session) + '<main class="options-content">' + section(model, state) + "</main>";
  }

  Sereno.adminViews = {
    page: page
  };
})(globalThis.Sereno = globalThis.Sereno || {});

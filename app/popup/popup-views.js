/* Popup · page template: header, footer, tabs and the home screen, plus the
   composition of the domain views into the whole popup. Classic script that
   registers Sereno.popupViews. Presentational: it receives the popup UI
   model and the shared state, and returns HTML. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var account = Sereno.account;
  var history = Sereno.history;
  var survey = Sereno.survey;
  var onboardingUi = Sereno.onboardingUi;
  var accountUi = Sereno.accountUi;
  var historyUi = Sereno.historyUi;
  var surveyUi = Sereno.surveyUi;
  var protectionUi = Sereno.protectionUi;

  function header(model, state) {
    var left =
      model.view === "detail"
        ? '<button type="button" class="back-link" data-action="back-history">←  Historial</button>'
        : '<div class="brand">' + ui.logo("brand-logo", "Sereno") + '<span class="brand-name">Sereno</span></div>';
    var slot = "";
    if (model.view === "onboarding") {
      slot = onboardingUi.stepCounter(model.onboardingStep);
    } else if (state.session) {
      slot = accountUi.accountButton(state.session);
    }
    return '<header class="app-header">' + left + '<div class="header-slot">' + slot + "</div></header>";
  }

  function footer(state) {
    return (
      '<footer class="app-footer">' +
      '<button type="button" class="footer-link" data-action="open-privacy">Política de privacidad</button>' +
      protectionUi.modelVersionLabel(state) + "</footer>"
    );
  }

  function tab(id, label, active) {
    return (
      '<button type="button" role="tab" data-action="tab" data-tab="' + id + '" class="' + (active ? "active" : "") +
      '" aria-selected="' + active + '">' + label + "</button>"
    );
  }

  function tabs(homeActive, large) {
    return (
      '<div class="' + ui.classes(["tabs", large && "tabs-lg"]) + '" role="tablist">' +
      tab("home", "Inicio", homeActive) + tab("history", "Historial", !homeActive) + "</div>"
    );
  }

  function adminEntryCard() {
    return (
      '<div class="admin-card"><div class="admin-title">Administración</div>' +
      '<p class="admin-text">Métricas, política por dominio y caché.</p>' +
      ui.button({ label: "Abrir panel de administración", variant: "primary", block: true, action: "open-admin" }) +
      "</div>"
    );
  }

  function noticeIfVisible(state) {
    return Sereno.protection.isNoticeVisible(state) ? protectionUi.modelNotice() : "";
  }

  function home(state) {
    var session = state.session;
    var admin = account.isAdmin(session);
    var parts = [];
    if (session && !admin) {
      parts.push(tabs(true, true));
    }
    parts.push(protectionUi.protectionCard());
    if (!session) {
      parts.push(
        protectionUi.siteCard(state.currentSite),
        protectionUi.iconLegend(),
        '<div class="flex-spacer"></div>',
        '<p class="muted-line">Inicia sesión para guardar tu historial.</p>',
        '<div class="actions-stack">' +
          ui.button({ label: "Iniciar sesión", variant: "primary", block: true, action: "go-login" }) +
          ui.button({ label: "Crear cuenta", variant: "ghost", block: true, action: "go-register" }) +
          "</div>"
      );
    } else if (admin) {
      parts.push(adminEntryCard(), noticeIfVisible(state));
    } else {
      parts.push(noticeIfVisible(state));
    }
    return '<section class="' + ui.classes(["view", "view-home", admin && "view-home-admin"]) + '">' + parts.join("") + "</section>";
  }

  function userEntries(state) {
    return history.entriesOf(state.history, state.session && state.session.username);
  }

  function content(model, state) {
    switch (model.view) {
      case "onboarding":
        return onboardingUi.view(model.onboardingStep);
      case "login":
        return accountUi.loginView({ error: model.loginError, username: model.draftUsername, password: model.draftPassword });
      case "register":
        return accountUi.registerView({ error: model.registerError, username: model.draftUsername, password: model.draftPassword });
      case "history":
        return historyUi.listView({ tabsHtml: tabs(false, false), entries: userEntries(state), filter: model.historyFilter });
      case "detail":
        return historyUi.detailView(history.findById(userEntries(state), model.detailId));
      case "survey":
        return surveyUi.questionView({ index: model.surveyIndex, selected: model.surveyAnswers[model.surveyIndex] });
      case "surveyResult":
        return surveyUi.resultView(survey.score(model.surveyAnswers));
      default:
        return home(state);
    }
  }

  /* model: the popup UI state (view, step, filter, drafts, overlays). */
  function page(model, state) {
    return (
      header(model, state) +
      '<main class="app-content" id="content">' + content(model, state) + "</main>" +
      footer(state) +
      (model.menuOpen && state.session ? accountUi.accountMenu(state.session) : "") +
      (model.confirmOpen ? historyUi.clearConfirm() : "")
    );
  }

  Sereno.popupViews = {
    page: page
  };
})(globalThis.Sereno = globalThis.Sereno || {});

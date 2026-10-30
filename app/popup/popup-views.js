/* Popup · page template: header, footer, tabs and the home screen, plus the
   composition of the domain views into the whole popup. Classic script that
   registers Sereno.popupViews. Presentational: it receives the popup UI
   model and the shared state, and returns HTML. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var account = Sereno.account;
  var history = Sereno.history;
  var onboardingUi = Sereno.onboardingUi;
  var accountUi = Sereno.accountUi;
  var historyUi = Sereno.historyUi;
  var surveyUi = Sereno.surveyUi;
  var protectionUi = Sereno.protectionUi;
  var t = Sereno.popupI18n ? Sereno.popupI18n.t : function (text) { return text; };

  function header(model, state) {
    var inert = model.confirmOpen ? " inert" : "";
    var left =
      model.view === "detail"
        ? '<button type="button" class="back-link" data-action="back-history">←  ' + t("Historial") + '</button>'
        : '<div class="brand">' + ui.logo("brand-logo", "Sereno") + '<span class="brand-name">Sereno</span></div>';
    var slot = "";
    if (model.view === "onboarding") {
      slot = onboardingUi.stepCounter(model.onboardingStep);
    } else if (state.session) {
      slot = accountUi.accountButton(state.session, model.menuOpen);
    }
    return '<header class="app-header"' + inert + ">" + left + '<div class="header-slot">' + slot + "</div></header>";
  }

  function footer(state, model) {
    return (
      '<footer class="app-footer"' + (model.confirmOpen ? " inert" : "") + ">" +
      '<button type="button" class="footer-link" data-action="open-privacy">' + t("Política de privacidad") + '</button>' +
      protectionUi.modelVersionLabel(state, model.modelVersion) +
      '</footer>'
    );
  }

  /* Tabs follow the ARIA tab pattern: the active one is the only tab stop, the
     arrow keys move between them (popup container). Only the selected tab
     points at its panel (tabpanel-<id>, drawn by the view of that tab): the
     other panel is not in the page. */
  function tab(id, label, active) {
    return (
      '<button type="button" role="tab" data-action="tab" data-tab="' + id + '" class="' + (active ? "active" : "") +
      '" aria-selected="' + active + '" id="tab-' + id + '"' + (active ? ' aria-controls="tabpanel-' + id + '"' : "") +
      ' tabindex="' + (active ? "0" : "-1") + '">' +
      label + "</button>"
    );
  }

  function tabs(homeActive, slide) {
    var active = homeActive ? "home" : "history";
    return (
      '<div class="tabs tabs-lg" role="tablist" aria-label="' + t("Secciones") + '" data-active-tab="' + active + '"' +
      (slide === active ? ' data-tab-slide="' + active + '"' : "") + '>' +
      tab("home", t("Inicio"), homeActive) + tab("history", t("Historial"), !homeActive) + "</div>"
    );
  }

  function adminEntryCard() {
    return (
      '<div class="admin-card"><div class="admin-title">' + t("Administración") + '</div>' +
      '<p class="admin-text">' + t("Métricas, política por dominio y caché.") + '</p>' +
      ui.button({ label: t("Abrir panel de administración"), variant: "primary", block: true, action: "open-admin" }) +
      "</div>"
    );
  }

  /* The notice names the model version the backend reported; without it there is nothing to announce. */
  function noticeIfVisible(state, model) {
    return Sereno.protection.isNoticeVisible(state, model.modelVersion) ? protectionUi.modelNotice(model.modelVersion) : "";
  }

  /* "degraded" when the verdict backend is down (HU-26), otherwise "active". */
  function protectionLevel(state) {
    return typeof Sereno.protection.levelOf === "function" ? Sereno.protection.levelOf(state) : "active";
  }

  function home(state, model) {
    var session = state.session;
    var admin = account.isAdmin(session);
    var parts = ['<h1 class="sr-only">Sereno</h1>'];
    if (session) {
      parts.push(tabs(true, model.tabSlide));
    }
    var card = protectionUi.protectionCard(protectionLevel(state));
    var site = protectionUi.siteCard(state.currentSite, protectionLevel(state));
    if (!session) {
      parts.push(
        card,
        site,
        protectionUi.iconLegend(),
        '<div class="flex-spacer"></div>',
        '<p class="muted-line">' + t("Inicia sesión para guardar tu historial.") + '</p>',
        '<div class="actions-stack">' +
          ui.button({ label: t("Iniciar sesión"), variant: "primary", block: true, action: "go-login" }) +
          ui.button({ label: t("Crear cuenta"), variant: "ghost", block: true, action: "go-register" }) +
          "</div>"
      );
    } else {
      parts.push(
        '<div class="tab-panel" role="tabpanel" id="tabpanel-home" aria-labelledby="tab-home">' +
        card + site + (admin ? adminEntryCard() : "") + noticeIfVisible(state, model) + "</div>"
      );
    }
    return '<section class="' + ui.classes(["view", "view-home", admin && "view-home-admin"]) + '">' + parts.join("") + "</section>";
  }

  /* The signed-in user's history as the data port returned it (see the popup container). */
  function userEntries(model) {
    return model.historyEntries || [];
  }

  function content(model, state) {
    switch (model.view) {
      case "onboarding":
        return onboardingUi.view(model.onboardingStep);
      case "login":
        return accountUi.loginView({ error: model.loginError, errorCode: model.loginErrorCode, username: model.draftUsername, password: model.draftPassword });
      case "register":
        return accountUi.registerView({ error: model.registerError, errorCode: model.registerErrorCode, username: model.draftUsername, password: model.draftPassword });
      case "history":
        return historyUi.listView({
          tabsHtml: tabs(false, model.tabSlide),
          entries: userEntries(model),
          filter: model.historyFilter,
          loading: model.historyLoading,
          error: model.historyError,
          errorCode: model.historyErrorCode
        });
      case "detail":
        return historyUi.detailView(history.findById(userEntries(model), model.detailId));
      case "surveyStatus":
        return surveyUi.statusView({ state: model.surveyStatus, error: model.surveyStatusError });
      case "survey":
        return surveyUi.questionView({ index: model.surveyIndex, selected: model.surveyAnswers[model.surveyIndex] });
      case "surveyResult":
        return surveyUi.resultView({ state: model.surveySubmission, error: model.surveyError });
      default:
        return home(state, model);
    }
  }

  /* model: the popup UI state (view, step, filter, drafts, overlays). */
  /* Shown when the backend could not confirm the stored session: the local
     session stays in use and the user can try again. */
  function sessionNotice(model, state) {
    if (!model.sessionOffline || !state.session) {
      return "";
    }
    return (
      '<div class="session-notice" role="status"><span>' + t("Sin conexión con el servidor. Usamos tu sesión guardada en este dispositivo.") + '</span>' +
      '<button type="button" class="link-btn" data-action="retry-session">' + t("Reintentar") + '</button></div>'
    );
  }

  function page(model, state) {
    return (
      header(model, state) +
      sessionNotice(model, state) +
      '<main class="app-content" id="content"' + (model.confirmOpen ? " inert" : "") + ">" + content(model, state) + "</main>" +
      footer(state, model) +
      (model.menuOpen && state.session
        ? accountUi.accountMenu(state.session, { language: model.language, showSurvey: model.surveyMenuStatus !== "loading" && model.surveyMenuStatus !== "submitted" })
        : "") +
      (model.confirmOpen ? historyUi.clearConfirm() : "")
    );
  }

  Sereno.popupViews = {
    page: page
  };
})(globalThis.Sereno = globalThis.Sereno || {});

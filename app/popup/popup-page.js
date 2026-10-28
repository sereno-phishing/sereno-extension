/* Popup · container: owns the popup UI state, subscribes to the shared
   store, delegates every data-action click to a use case or a UI transition,
   and re-renders through the presentational Sereno.popupViews.
   Classic script. No inline handlers (MV3 CSP). */

(function () {
  "use strict";

  var account = Sereno.account;
  var history = Sereno.history;
  var survey = Sereno.survey;
  var onboarding = Sereno.onboarding;
  var preferences = Sereno.preferences;
  var store = Sereno.stateStore.open();
  // The composition root: auth, history, survey and model version go through
  // its ports, never to an adapter.
  var services = Sereno.services;

  var UI_KEY = "sereno.ui.v1";

  var App = {
    initialized: false,
    state: null,
    view: "home",
    onboardingStep: 1,
    tab: "home",
    tabSlide: null,
    historyFilter: history.ALL,
    detailId: null,
    surveyIndex: 0,
    surveyAnswers: [],
    menuOpen: false,
    confirmOpen: false,
    loginError: false,
    loginErrorCode: null,
    registerError: false,
    registerErrorCode: null,
    draftUsername: "",
    draftPassword: "",
    // Backend-owned data, as the data port returned it.
    historyEntries: [],
    historyLoading: false,
    historyError: null,
    modelVersion: null,
    // Account-scoped participation confirmed by the backend for menu visibility.
    surveyMenuStatus: "idle",
    surveyStatus: "idle",
    surveyStatusError: null,
    surveySubmission: "idle",
    surveyError: null,
    // True while the backend could not confirm the stored session (offline notice).
    sessionOffline: false
  };

  // What the last backend load was for, so a store change reloads only when it matters.
  var loaded = { user: null, modelKey: null };
  var historyRun = 0;
  var modelRun = 0;
  var surveyStatusRun = 0;
  var surveySubmitRun = 0;
  var surveyUser = null;

  var root = null;

  /* ---------------- UI state helpers ---------------- */

  function saveUi() {
    preferences.write(UI_KEY, { tab: App.tab });
  }

  function restoreUi() {
    var ui = preferences.read(UI_KEY);
    if (ui && (ui.tab === "home" || ui.tab === "history")) {
      App.tab = ui.tab;
    }
  }

  /* Moves focus to the first element that matches, after a render. */
  function focusFirst(selector) {
    var node = root.querySelector(selector);
    if (node) {
      node.focus();
    }
  }

  function show(view) {
    App.view = view;
    App.tab = view === "history" ? "history" : "home";
  }

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    var restoreFocus = Sereno.ui.captureFocus(root);
    root.innerHTML = Sereno.popupViews.page(App, App.state);
    restoreFocus();
    if (typeof root.removeAttribute === "function") {
      root.removeAttribute("aria-busy");
    }
    // Each render replaces the tabs, so animate only the requested tab change.
    App.tabSlide = null;
  }

  /* ---------------- survey flow ---------------- */

  function currentSurveyUser() {
    return App.state && App.state.session ? App.state.session.username : null;
  }

  function resetSurveyDraftFromState() {
    App.surveyAnswers = survey.draftAnswers(Sereno.surveyService.draftFor(App.state, currentSurveyUser()));
    App.surveyIndex = 0;
  }

  /* Refreshes account-scoped participation without changing the current view.
     While pending, the menu entry stays hidden so completed accounts do not see
     it flash. A failure remains retryable through the visible menu entry. */
  async function loadSurveyMenuStatus() {
    surveyStatusRun += 1;
    var run = surveyStatusRun;
    var username = currentSurveyUser();
    if (!username) {
      App.surveyMenuStatus = "idle";
      return;
    }
    App.surveyMenuStatus = "loading";
    render();
    var result = await Sereno.surveyService.status(services);
    if (run !== surveyStatusRun || currentSurveyUser() !== username) {
      return;
    }
    App.surveyMenuStatus = !result.ok ? "error" : result.submitted ? "submitted" : "available";
    render();
  }

  /* Eligibility is backend-owned. The local completion marker is retained
     only as UI history and never decides whether the form is available. */
  async function loadSurveyStatus() {
    surveyStatusRun += 1;
    var run = surveyStatusRun;
    var username = currentSurveyUser();
    surveySubmitRun += 1;
    App.surveyMenuStatus = "loading";
    App.surveyStatus = "loading";
    App.surveyStatusError = null;
    App.surveySubmission = "idle";
    App.surveyError = null;
    App.view = "surveyStatus";
    render();
    var result = await Sereno.surveyService.status(services);
    if (run !== surveyStatusRun || currentSurveyUser() !== username) {
      return;
    }
    if (!result.ok) {
      App.surveyMenuStatus = "error";
      App.surveyStatus = "error";
      App.surveyStatusError = result.message;
      App.view = "surveyStatus";
    } else if (result.submitted) {
      App.surveyMenuStatus = "submitted";
      App.surveyStatus = "submitted";
      App.surveySubmission = "already";
      App.view = "surveyResult";
    } else {
      App.surveyMenuStatus = "available";
      App.surveyStatus = "available";
      App.view = "survey";
    }
    render();
  }

  /* Sends the finished survey to the backend. Success is rendered only after
     acceptance; duplicate means this account already participated. */
  async function submitSurvey() {
    surveySubmitRun += 1;
    var run = surveySubmitRun;
    var username = currentSurveyUser();
    var answers = App.surveyAnswers.slice();
    App.surveySubmission = "submitting";
    App.surveyError = null;
    App.view = "surveyResult";
    render();
    var result = await Sereno.surveyService.submit(services, store, username, answers, new Date());
    if (run !== surveySubmitRun || currentSurveyUser() !== username) {
      return;
    }
    if (result.ok) {
      App.surveyMenuStatus = "submitted";
      App.surveyStatus = "submitted";
      App.surveySubmission = "accepted";
    } else if (result.error === "already_submitted") {
      App.surveyMenuStatus = "submitted";
      App.surveyStatus = "submitted";
      App.surveySubmission = "already";
    } else {
      App.surveySubmission = "error";
      App.surveyError = result.message;
    }
    render();
  }

  function selectAnswer(value) {
    if (App.surveyStatus !== "available" || App.view !== "survey" || !value) {
      return;
    }
    var username = currentSurveyUser();
    App.surveyAnswers[App.surveyIndex] = value;
    Sereno.surveyService.saveDraft(store, username, App.surveyAnswers);
    render();
  }

  function nextSurveyQuestion() {
    if (App.surveyStatus !== "available" || App.view !== "survey" || !App.surveyAnswers[App.surveyIndex]) {
      return;
    }
    if (survey.isLastQuestion(App.surveyIndex)) {
      submitSurvey();
      return;
    }
    App.surveyIndex += 1;
    render();
  }

  /* ---------------- account flow ---------------- */

  /* After a successful sign-in or sign-up the popup returns to a clean home. */
  function enterHome() {
    clearAuthErrors();
    show("home");
    App.historyFilter = history.ALL;
    saveUi();
    render();
  }

  function clearAuthErrors() {
    App.loginError = false;
    App.loginErrorCode = null;
    App.registerError = false;
    App.registerErrorCode = null;
  }

  /* Kept as promise callbacks: the popup tests rely on this exact timing
     (one microtask after the use case settles); an async function adds a tick. */
  function submitLogin(username, password) {
    Sereno.accountService.login(services, store, username, password, new Date()).then(function (result) {
      if (!result.ok) {
        App.loginError = true;
        App.loginErrorCode = result.error || null;
        render();
        return;
      }
      enterHome();
    });
  }

  function submitRegister(username, password) {
    Sereno.accountService.register(services, store, username, password, new Date()).then(function (result) {
      if (!result.ok) {
        App.registerError = true;
        App.registerErrorCode = result.error || null;
        render();
        return;
      }
      App.surveyIndex = 0;
      App.surveyAnswers = [];
      enterHome();
    });
  }

  /* ---------------- backend data (history, model version) ---------------- */

  /* Sets fields on the UI model and renders only when something changed. */
  function setData(patch) {
    var changed = Object.keys(patch).some(function (name) {
      return JSON.stringify(patch[name]) !== JSON.stringify(App[name]);
    });
    Object.assign(App, patch);
    if (changed) {
      render();
    }
  }

  /* Loads the signed-in user's history through the port. silent: keep what is
     on screen while the list refreshes (no loading state). */
  async function loadHistory(silent) {
    historyRun += 1;
    var run = historyRun;
    var session = App.state && App.state.session;
    if (!session || account.isAdmin(session)) {
      setData({ historyEntries: [], historyLoading: false, historyError: null });
      return;
    }
    var showLoading = !silent && !App.historyEntries.length;
    setData({ historyLoading: showLoading, historyError: silent ? App.historyError : null });
    var result = await Sereno.historyService.list(services);
    if (run !== historyRun) {
      return;
    }
    if (result.ok) {
      setData({ historyEntries: result.entries, historyLoading: false, historyError: null });
    } else {
      setData({ historyLoading: false, historyError: result.message });
    }
  }

  async function loadModelVersion() {
    modelRun += 1;
    var run = modelRun;
    var result = await Sereno.protectionService.loadModelVersion(services);
    if (run === modelRun) {
      setData({ modelVersion: result.ok ? result.version : null });
    }
  }

  function syncSurveyAccount(state) {
    var username = state.session ? state.session.username : null;
    if (username === surveyUser) {
      return;
    }
    surveyUser = username;
    surveyStatusRun += 1;
    surveySubmitRun += 1;
    App.surveyAnswers = survey.draftAnswers(Sereno.surveyService.draftFor(state, username));
    App.surveyIndex = 0;
    App.surveyMenuStatus = username ? "loading" : "idle";
    App.surveyStatus = "idle";
    App.surveyStatusError = null;
    App.surveySubmission = "idle";
    App.surveyError = null;
    var inSurvey = App.view === "surveyStatus" || App.view === "survey" || App.view === "surveyResult";
    if (!username && inSurvey) {
      show("home");
    } else if (username && inSurvey) {
      loadSurveyStatus();
    } else if (username) {
      loadSurveyMenuStatus();
    }
  }

  /* Reloads what depends on who is signed in, and refreshes the history while it is on screen. */
  function syncBackendData(state) {
    var session = state.session;
    var user = session ? session.username : null;
    /* The backend reports one version, so it is asked once per user and not again when the notice is dismissed. */
    var modelKey = String(user);
    if (modelKey !== loaded.modelKey) {
      loaded.modelKey = modelKey;
      loadModelVersion();
    }
    if (user !== loaded.user) {
      loaded.user = user;
      App.historyEntries = [];
      loadHistory(false);
    } else if (App.view === "history" || App.view === "detail") {
      loadHistory(true);
    }
  }

  async function clearHistoryNow() {
    if (!App.state.session) {
      return;
    }
    var result = await Sereno.historyService.clear(services);
    App.confirmOpen = false;
    if (result.ok) {
      App.historyEntries = [];
      App.historyError = null;
    } else {
      App.historyError = result.message;
    }
    show("history");
    render();
  }

  /* Asks the backend whether the stored session still holds. Never blocks the
     first render: offline or failing, the local session stays and a notice
     with a retry shows. A session the backend dropped sends the user home. */
  async function refreshSession() {
    var result = null;
    try {
      result = await Sereno.accountService.currentSession(services, store);
    } catch (error) {
      result = null;
    }
    var unconfirmed = !result || !result.ok || !result.verified;
    var offline = unconfirmed && !!(App.state && App.state.session);
    if (result && result.ok && result.verified && !result.session && App.view !== "onboarding") {
      App.menuOpen = false;
      App.detailId = null;
      show("home");
      render();
    }
    setData({ sessionOffline: offline });
  }

  /* ---------------- actions ---------------- */

  /* Command table: data-action name -> handler(target). */
  var ACTIONS = {
    "onboarding-next": function () {
      App.onboardingStep = onboarding.next(App.onboardingStep);
      render();
    },
    "onboarding-back": function () {
      App.onboardingStep = onboarding.back(App.onboardingStep);
      render();
    },
    "onboarding-start": function () {
      Sereno.onboardingService.complete(store).then(function () {
        show("home");
        saveUi();
        render();
      });
    },
    "go-login": function () {
      clearAuthErrors();
      App.view = "login";
      render();
    },
    "go-register": function () {
      clearAuthErrors();
      App.view = "register";
      render();
    },
    "auth-back": function () {
      clearAuthErrors();
      show("home");
      render();
    },
    "toggle-menu": function () {
      App.menuOpen = !App.menuOpen;
      render();
      focusFirst(App.menuOpen ? ".menu-item" : '[data-action="toggle-menu"]');
    },
    "close-menu": function () {
      if (App.menuOpen) {
        App.menuOpen = false;
        render();
      }
    },
    logout: function () {
      Sereno.accountService.logout(services, store).then(function () {
        App.menuOpen = false;
        show("home");
        App.historyFilter = history.ALL;
        App.detailId = null;
        saveUi();
        render();
      });
    },
    "open-admin": function () {
      App.menuOpen = false;
      render();
      Sereno.browser.openPage("app/admin/admin.html");
    },
    "open-privacy": function () {
      Sereno.browser.openPage("app/privacy/privacy.html");
    },
    "open-survey": function () {
      App.menuOpen = false;
      resetSurveyDraftFromState();
      loadSurveyStatus();
    },
    answer: function (target) {
      selectAnswer(Number(target.getAttribute("data-value")));
    },
    "survey-back": function () {
      if (App.surveyIndex > 0) {
        App.surveyIndex -= 1;
        render();
      }
    },
    "survey-next": nextSurveyQuestion,
    "survey-status-retry": loadSurveyStatus,
    "survey-retry": submitSurvey,
    "survey-close": function () {
      surveyStatusRun += 1;
      surveySubmitRun += 1;
      App.surveyStatus = "idle";
      App.surveyStatusError = null;
      App.surveySubmission = "idle";
      App.surveyError = null;
      show("home");
      render();
    },
    tab: function (target) {
      var nextTab = target.getAttribute("data-tab") === "history" ? "history" : "home";
      App.tabSlide = App.view === App.tab && App.tab !== nextTab ? nextTab : null;
      show(nextTab);
      saveUi();
      render();
      if (nextTab === "history") {
        loadHistory(true);
      }
    },
    "retry-history": function () {
      loadHistory(false);
    },
    filter: function (target) {
      App.historyFilter = target.getAttribute("data-filter") || history.ALL;
      render();
    },
    "open-detail": function (target) {
      App.detailId = target.getAttribute("data-id");
      App.view = "detail";
      render();
    },
    "back-history": function () {
      show("history");
      render();
    },
    "confirm-clear": function () {
      App.confirmOpen = true;
      render();
      focusFirst('[data-action="cancel-clear"]');
    },
    "cancel-clear": function () {
      App.confirmOpen = false;
      render();
      focusFirst('[data-action="confirm-clear"]');
    },
    "confirm-clear-yes": clearHistoryNow,
    "retry-session": function () {
      refreshSession();
    },
    "dismiss-notice": function () {
      Sereno.protectionService.dismissModelNotice(store, App.modelVersion);
    }
  };

  function onSubmit(event) {
    var form = event.target;
    var kind = form && form.getAttribute ? form.getAttribute("data-form") : null;
    if (!kind) {
      return;
    }
    event.preventDefault();
    var usernameInput = form.querySelector('[name="username"]');
    var passwordInput = form.querySelector('[name="password"]');
    App.draftUsername = usernameInput ? usernameInput.value.trim() : "";
    App.draftPassword = passwordInput ? passwordInput.value : "";
    if (kind === "login") {
      submitLogin(App.draftUsername, App.draftPassword);
    } else if (kind === "register") {
      submitRegister(App.draftUsername, App.draftPassword);
    }
  }

  /* Arrow keys, Home and End move between the elements of a roving group
     (tabs, menu items); returns the element to focus or null. */
  function rovingTarget(event, group, orientation) {
    var items = Array.prototype.slice.call(root.querySelectorAll(group));
    var index = items.indexOf(event.target);
    var next = index < 0 ? -1 : Sereno.ui.rovingIndex(items.length, index, event.key, orientation);
    return next < 0 ? null : items[next];
  }

  function onKeydown(event) {
    if (event.key === "Tab" && App.confirmOpen) {
      Sereno.ui.trapTab(event, root.querySelector(".confirm-card"));
      return;
    }
    if (event.key === "Escape") {
      if (App.confirmOpen) {
        App.confirmOpen = false;
        render();
        focusFirst('[data-action="confirm-clear"]');
      } else if (App.menuOpen) {
        App.menuOpen = false;
        render();
        focusFirst('[data-action="toggle-menu"]');
      }
      return;
    }
    var tabTarget = rovingTarget(event, '[role="tab"]', "horizontal");
    if (tabTarget) {
      event.preventDefault();
      ACTIONS.tab(tabTarget);
      focusFirst('[role="tab"][data-tab="' + tabTarget.getAttribute("data-tab") + '"]');
      return;
    }
    var menuTarget = rovingTarget(event, ".menu-item", "vertical");
    if (menuTarget) {
      event.preventDefault();
      menuTarget.focus();
    }
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (App.initialized) {
      return;
    }
    root = document.getElementById("app");
    if (!root) {
      return;
    }
    App.initialized = true;
    restoreUi();
    Sereno.ui.delegateActions(root, ACTIONS);
    root.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeydown);
    store.subscribe(function (state) {
      App.state = state;
      syncSurveyAccount(state);
      syncBackendData(state);
      render();
    });
    store.ready().then(function (state) {
      App.state = state;
      syncSurveyAccount(state);
      syncBackendData(state);
      if (!onboarding.isDone(state)) {
        App.view = "onboarding";
        App.onboardingStep = 1;
      } else {
        var historyTab = state.session && !account.isAdmin(state.session) && App.tab === "history";
        show(historyTab ? "history" : "home");
      }
      render();
      refreshSession();
    });
  }

  Sereno.ui.onReady(init);
})();

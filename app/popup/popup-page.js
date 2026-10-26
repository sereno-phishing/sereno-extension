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
    surveyError: null
  };

  // What the last backend load was for, so a store change reloads only when it matters.
  var loaded = { user: null, modelKey: null };
  var historyRun = 0;
  var modelRun = 0;

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

  function show(view) {
    App.view = view;
    App.tab = view === "history" ? "history" : "home";
  }

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    root.innerHTML = Sereno.popupViews.page(App, App.state);
    // Each render replaces the tabs, so animate only the requested tab change.
    App.tabSlide = null;
  }

  /* ---------------- survey flow ---------------- */

  function resetSurveyDraftFromState() {
    App.surveyAnswers = survey.draftAnswers(App.state && App.state.survey && App.state.survey.answers);
    App.surveyIndex = 0;
  }

  /* Sends the finished survey to the backend; a failure keeps the score on
     screen with a message and a retry. */
  async function submitSurvey() {
    var hadError = !!App.surveyError;
    App.surveyError = null;
    var result = await Sereno.surveyService.submit(services, store, App.surveyAnswers, new Date());
    if (!result.ok) {
      App.surveyError = result.message;
    }
    if (!result.ok || hadError) {
      render();
    }
  }

  function selectAnswer(value) {
    if (!value) {
      return;
    }
    App.surveyAnswers[App.surveyIndex] = value;
    Sereno.surveyService.saveDraft(store, App.surveyAnswers);
    render();
  }

  function nextSurveyQuestion() {
    if (!App.surveyAnswers[App.surveyIndex]) {
      return;
    }
    if (survey.isLastQuestion(App.surveyIndex)) {
      App.view = "surveyResult";
      App.surveyError = null;
      render();
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

  /* Reloads what depends on who is signed in, and refreshes the history while it is on screen. */
  function syncBackendData(state) {
    var session = state.session;
    var user = session ? session.username : null;
    var modelKey = user + "|" + !!state.modelNoticeDismissed;
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
      App.view = "survey";
      render();
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
    "survey-retry": submitSurvey,
    "survey-close": function () {
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
    },
    "cancel-clear": function () {
      App.confirmOpen = false;
      render();
    },
    "confirm-clear-yes": clearHistoryNow,
    "dismiss-notice": function () {
      Sereno.protectionService.dismissModelNotice(store);
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

  function onKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    if (App.confirmOpen) {
      App.confirmOpen = false;
      render();
    } else if (App.menuOpen) {
      App.menuOpen = false;
      render();
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
      syncBackendData(state);
      render();
    });
    store.ready().then(function (state) {
      App.state = state;
      syncBackendData(state);
      App.surveyAnswers = survey.draftAnswers(state.survey && state.survey.answers);
      if (!onboarding.isDone(state)) {
        App.view = "onboarding";
        App.onboardingStep = 1;
      } else {
        var historyTab = state.session && !account.isAdmin(state.session) && App.tab === "history";
        show(historyTab ? "history" : "home");
      }
      render();
    });
  }

  Sereno.ui.onReady(init);
})();

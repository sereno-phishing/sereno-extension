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

  var UI_KEY = "sereno.ui.v1";

  var App = {
    initialized: false,
    state: null,
    view: "home",
    onboardingStep: 1,
    tab: "home",
    historyFilter: history.ALL,
    detailId: null,
    surveyIndex: 0,
    surveyAnswers: [],
    menuOpen: false,
    confirmOpen: false,
    loginError: false,
    registerError: false,
    draftUsername: "",
    draftPassword: ""
  };

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
  }

  /* ---------------- survey flow ---------------- */

  function resetSurveyDraftFromState() {
    App.surveyAnswers = survey.draftAnswers(App.state && App.state.survey && App.state.survey.answers);
    App.surveyIndex = 0;
  }

  function persistSurvey(completed) {
    Sereno.surveyService.saveAnswers(store, App.surveyAnswers, completed, new Date());
  }

  function selectAnswer(value) {
    if (!value) {
      return;
    }
    App.surveyAnswers[App.surveyIndex] = value;
    persistSurvey(false);
    render();
  }

  function nextSurveyQuestion() {
    if (!App.surveyAnswers[App.surveyIndex]) {
      return;
    }
    if (survey.isLastQuestion(App.surveyIndex)) {
      App.view = "surveyResult";
      persistSurvey(true);
      render();
      return;
    }
    App.surveyIndex += 1;
    render();
  }

  /* ---------------- account flow ---------------- */

  /* After a successful sign-in or sign-up the popup returns to a clean home. */
  function enterHome() {
    App.loginError = false;
    App.registerError = false;
    show("home");
    App.historyFilter = history.ALL;
    saveUi();
    render();
  }

  function submitLogin(username, password) {
    Sereno.accountService.login(store, username, password, new Date()).then(function (result) {
      if (!result.ok) {
        App.loginError = true;
        render();
        return;
      }
      enterHome();
    });
  }

  function submitRegister(username, password) {
    Sereno.accountService.register(store, username, password, new Date()).then(function (result) {
      if (!result.ok) {
        App.registerError = true;
        render();
        return;
      }
      App.surveyIndex = 0;
      App.surveyAnswers = [];
      enterHome();
    });
  }

  function clearHistoryNow() {
    var session = App.state.session;
    if (!session) {
      return;
    }
    Sereno.historyService.clear(store, session.username).then(function () {
      App.confirmOpen = false;
      show("history");
      render();
    });
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
      App.loginError = false;
      App.view = "login";
      render();
    },
    "go-register": function () {
      App.registerError = false;
      App.view = "register";
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
      Sereno.accountService.logout(store).then(function () {
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
    "survey-close": function () {
      show("home");
      render();
    },
    tab: function (target) {
      show(target.getAttribute("data-tab") === "history" ? "history" : "home");
      saveUi();
      render();
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
      render();
    });
    store.ready().then(function (state) {
      App.state = state;
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

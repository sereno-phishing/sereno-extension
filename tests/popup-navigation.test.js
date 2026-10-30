"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load } = require("./load");

const realUi = load("ui/atoms.js", "ui/dom.js").ui;

// Exercise the actual controller without exposing its private App state.
async function popupHarness(extra = {}) {
  const state = { session: null, accounts: [], survey: { byUser: {} }, history: {}, ...(extra.state || {}) };
  const originalState = structuredClone(state);
  const renders = [];
  const focused = [];
  const trapped = [];
  const calls = [];
  const listeners = {};
  const documentListeners = {};
  let actions;
  let subscriber = null;
  const root = {
    innerHTML: "",
    addEventListener: (name, handler) => { listeners[name] = handler; },
    querySelector: (selector) => { focused.push(selector); return { focus: () => {} }; },
    querySelectorAll: () => extra.items || []
  };
  const Sereno = {
    i18n: extra.i18n,
    storage: extra.storage,
    account: { isAdmin: (session) => !!session && session.isAdmin === true },
    history: { ALL: "all" },
    survey: { draftAnswers: (answers) => [...answers] },
    onboarding: { isDone: () => true },
    preferences: { read: () => null, write: (...args) => calls.push(["preferences.write", ...args]) },
    stateStore: { open: () => ({
      subscribe: (handler) => { subscriber = handler; handler(state); },
      ready: () => Promise.resolve(state),
      get: () => Promise.resolve(structuredClone(state)),
      set: (patch) => {
        calls.push(["store.set"]);
        Object.assign(state, patch);
        if (subscriber) subscriber(state);
        return Promise.resolve();
      },
      update: (mutate) => {
        calls.push(["store.update"]);
        const patch = mutate(structuredClone(state));
        if (patch) Object.assign(state, patch);
        if (patch && subscriber) subscriber(state);
        return Promise.resolve();
      },
      transact: (mutate) => {
        calls.push(["store.transact"]);
        const outcome = mutate(structuredClone(state)) || {};
        if (outcome.patch) Object.assign(state, outcome.patch);
        if (outcome.patch && subscriber) subscriber(state);
        return Promise.resolve(outcome.result);
      }
    }) },
    time: { stamp: () => { calls.push(["completedAt"]); return "completed"; } },
    services: extra.services || { survey: { status: async () => ({ ok: true, submitted: false }), submit: async () => ({ ok: true }) } },
    historyService: extra.historyService || { list: async () => ({ ok: true, entries: [] }), clear: async () => ({ ok: true }) },
    protectionService: extra.protectionService || { loadModelVersion: async () => ({ ok: true, version: "1.2" }) },
    accountService: {
      login: () => { calls.push(["login"]); return Promise.resolve({ ok: false }); },
      register: () => { calls.push(["register"]); return Promise.resolve({ ok: false }); },
      ...(extra.accountService || {})
    },
    popupViews: { page: (model) => { renders.push({ ...model, surveyAnswers: [...model.surveyAnswers] }); return model.view; } },
    ui: {
      captureFocus: () => () => {},
      rovingIndex: realUi.rovingIndex,
      trapTab: (...args) => { trapped.push(args); },
      delegateActions: (_root, handlers) => { actions = handlers; },
      onReady: (init) => init()
    }
  };
  const context = vm.createContext({
    Sereno,
    document: { getElementById: () => root, addEventListener: (name, handler) => { documentListeners[name] = handler; } }
  });
  for (const file of ["platform/providers/errors.js", "survey/domain/sus.js", "survey/application/survey-service.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/popup/popup-page.js"), "utf8"), context);
  await Promise.resolve();
  return {
    actions, listeners, documentListeners, focused, trapped, state, originalState, calls, renders, root,
    emitState(patch) {
      Object.assign(state, patch);
      if (subscriber) subscriber(state);
    }
  };
}

test("language selector saves the selected preference", async () => {
  const selected = [];
  const language = { get: () => "es", ready: async () => "es", subscribe: () => {}, set: async (value) => { selected.push(value); } };
  const popup = await popupHarness({ i18n: { create: () => language }, storage: { detect: () => ({}) } });
  popup.listeners.change({ target: { id: "language-en", name: "language", type: "radio", value: "en" } });
  await Promise.resolve();
  assert.deepEqual(selected, ["en"]);
});

test("menu stays open when language changes and Escape returns focus to the badge", async () => {
  let notify;
  const language = { get: () => "es", ready: async () => "es", subscribe: (callback) => { notify = callback; }, set: async (value) => { notify(value); } };
  for (const isAdmin of [false, true]) {
    const popup = await popupHarness({ state: { session: { username: "ana", isAdmin } }, i18n: { create: () => language }, storage: { detect: () => ({}) } });
    popup.actions["toggle-menu"]();
    popup.listeners.change({ target: { id: "language-en", name: "language", type: "radio", value: "en" } });
    assert.equal(popup.renders.at(-1).language, "en");
    assert.equal(popup.renders.at(-1).menuOpen, true);
    popup.documentListeners.keydown({ key: "Escape", target: {} });
    assert.equal(popup.renders.at(-1).menuOpen, false);
    assert.equal(popup.focused.at(-1), '[data-action="toggle-menu"]');
  }
});

test("radio arrow keys retain native selection behavior", async () => {
  const popup = await popupHarness();
  let prevented = false;
  popup.documentListeners.keydown({ key: "ArrowDown", target: { name: "language", type: "radio" }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
});

test("external language updates rerender the popup without altering backend data", async () => {
  let notify;
  const language = { get: () => "es", ready: async () => "es", subscribe: (callback) => { notify = callback; }, set: async () => {} };
  const popup = await popupHarness({ i18n: { create: () => language }, storage: { detect: () => ({}) } });
  notify("en");
  assert.equal(popup.renders.at(-1).language, "en");
  assert.deepEqual(popup.state, popup.originalState);
});

test("a failed language write restores the selector without an unhandled rejection", async () => {
  let attempts = 0;
  const language = { get: () => "es", ready: async () => "es", subscribe: () => {}, set: async () => { attempts += 1; throw new Error("storage unavailable"); } };
  const popup = await popupHarness({ i18n: { create: () => language }, storage: { detect: () => ({}) } });
  popup.listeners.change({ target: { id: "language-en", name: "language", type: "radio", value: "en" } });
  await settle();
  assert.equal(attempts, 1);
  assert.equal(popup.renders.at(-1).language, "es");
});

test("tab sliding runs once per real tab change, not on initial render, repeat clicks or redraws", async () => {
  const popup = await popupHarness();
  assert.ok(popup.renders.every((model) => model.tabSlide === null));
  popup.actions.tab({ getAttribute: () => "history" });
  assert.equal(popup.renders.at(-1).tabSlide, "history");
  popup.actions.filter({ getAttribute: () => "all" });
  assert.equal(popup.renders.at(-1).tabSlide, null);
  popup.actions.tab({ getAttribute: () => "history" });
  assert.equal(popup.renders.at(-1).tabSlide, null);
  popup.actions.tab({ getAttribute: () => "home" });
  assert.equal(popup.renders.at(-1).tabSlide, "home");
  popup.actions["open-survey"]();
  assert.equal(popup.renders.at(-1).tabSlide, null);
  popup.actions["survey-close"]();
  assert.equal(popup.renders.at(-1).tabSlide, null);
});

for (const index of [0, 4, 9]) {
  test(`exiting survey question ${index + 1} retains autosaved answers without completion or extra writes`, async () => {
    const popup = await popupHarness({ state: { session: USER, survey: { byUser: {} } } });
    popup.actions["open-survey"]();
    await settle();
    for (let step = 0; step <= index; step += 1) {
      popup.actions.answer({ getAttribute: () => "3" });
      if (step < index) popup.actions["survey-next"]();
    }
    assert.equal(popup.renders.at(-1).surveyIndex, index);
    const savedAnswers = Array.from(popup.state.survey.byUser.ana.answers);
    const writesBeforeExit = popup.calls.length;
    popup.actions["survey-close"]();
    assert.equal(popup.root.innerHTML, "home");
    assert.equal(popup.renders.at(-1).tab, "home");
    assert.equal(popup.calls.length, writesBeforeExit);
    assert.deepEqual(Array.from(popup.state.survey.byUser.ana.answers), savedAnswers);
    assert.equal(popup.state.survey.byUser.ana.completedAt, null);
    assert.ok(popup.calls.every(([call]) => call === "store.transact"));
    popup.actions["open-survey"]();
    await settle();
    assert.equal(popup.renders.at(-1).surveyIndex, 0);
    assert.deepEqual(popup.renders.at(-1).surveyAnswers, savedAnswers);
  });
}

test("survey previous-question action still navigates questions without exiting or saving", async () => {
  const popup = await popupHarness({ state: { session: USER } });
  popup.actions["open-survey"]();
  await settle();
  popup.actions["survey-back"]();
  assert.equal(popup.renders.at(-1).surveyIndex, 0);
  popup.actions.answer({ getAttribute: () => "4" });
  popup.actions["survey-next"]();
  const writesBeforeBack = popup.calls.length;
  popup.actions["survey-back"]();
  assert.equal(popup.root.innerHTML, "survey");
  assert.equal(popup.renders.at(-1).surveyIndex, 0);
  assert.equal(popup.renders.at(-1).surveyAnswers[0], 4);
  assert.equal(popup.calls.length, writesBeforeBack);
});

for (const kind of ["login", "register"]) {
  test(`leaving ${kind} returns home without authenticating or writing stored data`, async () => {
    const popup = await popupHarness();
    popup.actions[`go-${kind}`]();
    assert.equal(popup.root.innerHTML, kind);
    popup.actions["auth-back"]();
    assert.equal(popup.root.innerHTML, "home");
    assert.equal(popup.renders.at(-1).tab, "home");
    assert.deepEqual(popup.calls, []);
    assert.deepEqual(popup.state, popup.originalState);
    popup.actions[`go-${kind}`]();
    assert.equal(popup.root.innerHTML, kind);
  });

  test(`leaving a failed ${kind} clears its transient error without another submit`, async () => {
    const popup = await popupHarness();
    popup.actions[`go-${kind}`]();
    popup.listeners.submit({
      preventDefault() {},
      target: {
        getAttribute: () => kind,
        querySelector: (selector) => ({ value: selector.includes("username") ? "draft-user" : "draft-password" })
      }
    });
    await Promise.resolve();
    assert.equal(popup.renders.at(-1)[`${kind}Error`], true);
    popup.actions["auth-back"]();
    const model = popup.renders.at(-1);
    assert.equal(model.view, "home");
    assert.equal(model.loginError, false);
    assert.equal(model.registerError, false);
    assert.deepEqual(popup.calls, [[kind]]);
    assert.deepEqual(popup.state, popup.originalState);
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const USER = { username: "ana", isAdmin: false };

test("administrator can load and open personal history", async () => {
  const entries = [{ id: "admin-entry", domain: "example.com" }];
  const popup = await popupHarness({
    state: { session: { username: "admin", isAdmin: true } },
    historyService: { list: async () => ({ ok: true, entries }), clear: async () => ({ ok: true }) }
  });
  await new Promise((resolve) => setImmediate(resolve));
  popup.actions.tab({ getAttribute: () => "history" });
  assert.equal(popup.renders.at(-1).view, "history");
  assert.deepEqual(popup.renders.at(-1).historyEntries, entries);
});

test("a signed-in popup loads history and model version through the ports", async () => {
  const entries = [{ id: "h-1", domain: "a.pe", status: "seguro", score: 0.1, source: "modelo", ts: "2026-09-21T10:00", latencyMs: 10 }];
  const popup = await popupHarness({
    state: { session: USER },
    historyService: { list: async () => ({ ok: true, entries }), clear: async () => ({ ok: true }) },
    protectionService: { loadModelVersion: async () => ({ ok: true, version: "2.0" }) }
  });
  await settle();
  const model = popup.renders.at(-1);
  assert.deepEqual(model.historyEntries, entries);
  assert.equal(model.historyLoading, false);
  assert.equal(model.historyError, null);
  assert.equal(model.modelVersion, "2.0");
});

test("a failing history load shows its message and retry reloads it", async () => {
  let fail = true;
  const popup = await popupHarness({
    state: { session: USER },
    historyService: {
      list: async () => (fail ? { ok: false, error: "offline", message: "Sin conexión." } : { ok: true, entries: [] }),
      clear: async () => ({ ok: true })
    }
  });
  await settle();
  assert.equal(popup.renders.at(-1).historyError, "Sin conexión.");
  fail = false;
  popup.actions["retry-history"]();
  await settle();
  assert.equal(popup.renders.at(-1).historyError, null);
});

test("a new signed-in popup restores backend-confirmed participation without entering the survey", async () => {
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: async () => ({ ok: true, submitted: true }), submit: async () => ({ ok: true }) } }
  });
  await settle();
  const model = popup.renders.at(-1);
  assert.equal(model.view, "home");
  assert.equal(model.surveyMenuStatus, "submitted");
});

test("signing in restores backend-confirmed participation without entering the survey", async () => {
  const popup = await popupHarness({
    services: { survey: { status: async () => ({ ok: true, submitted: true }), submit: async () => ({ ok: true }) } }
  });
  popup.emitState({ session: USER });
  await settle();
  assert.equal(popup.renders.at(-1).view, "home");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "submitted");
});

test("a new signed-in popup shows survey eligibility only after backend confirmation", async () => {
  let release;
  const status = new Promise((resolve) => { release = resolve; });
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: { ana: { answers: [], completedAt: "local-only" } } } },
    services: { survey: { status: () => status, submit: async () => ({ ok: true }) } }
  });
  assert.equal(popup.renders.at(-1).view, "home");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "loading");
  release({ ok: true, submitted: false });
  await settle();
  assert.equal(popup.renders.at(-1).view, "home");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "available");
});

test("opening the survey waits for backend status before showing questions", async () => {
  let release;
  const status = new Promise((resolve) => { release = resolve; });
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: () => status, submit: async () => ({ ok: true }) } }
  });
  popup.actions["open-survey"]();
  assert.equal(popup.renders.at(-1).view, "surveyStatus");
  assert.equal(popup.renders.at(-1).surveyStatus, "loading");
  release({ ok: true, submitted: false });
  await settle();
  assert.equal(popup.renders.at(-1).view, "survey");
  assert.equal(popup.renders.at(-1).surveyStatus, "available");
});

test("a failed survey status is honest and retry can reveal the questionnaire", async () => {
  let offline = true;
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: async () => (offline ? { ok: false, error: "offline" } : { ok: true, submitted: false }), submit: async () => ({ ok: true }) } }
  });
  popup.actions["open-survey"]();
  await settle();
  assert.equal(popup.renders.at(-1).view, "surveyStatus");
  assert.equal(popup.renders.at(-1).surveyStatus, "error");
  assert.equal(popup.renders.at(-1).surveyStatusError, "offline");
  offline = false;
  popup.actions["survey-status-retry"]();
  await settle();
  assert.equal(popup.renders.at(-1).view, "survey");
});

test("backend submitted status shows recorded thanks without questions even when local storage is empty", async () => {
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: async () => ({ ok: true, submitted: true }), submit: async () => ({ ok: true }) } }
  });
  popup.actions["open-survey"]();
  await settle();
  const model = popup.renders.at(-1);
  assert.equal(model.view, "surveyResult");
  assert.equal(model.surveySubmission, "already");
  assert.equal(popup.state.survey.byUser.ana, undefined);
});

test("a local completion marker is not trusted when backend status says the survey is available", async () => {
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: { ana: { answers: [4, 2], completedAt: "old" } } } },
    services: { survey: { status: async () => ({ ok: true, submitted: false }), submit: async () => ({ ok: true }) } }
  });
  popup.actions["open-survey"]();
  await settle();
  assert.equal(popup.renders.at(-1).view, "survey");
  assert.deepEqual(popup.renders.at(-1).surveyAnswers.slice(0, 2), [4, 2]);
});

test("survey submission shows pending, then recorded thanks only after backend acceptance", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: async () => ({ ok: true, submitted: false }), submit: () => pending } }
  });
  popup.actions["open-survey"]();
  await settle();
  for (let step = 0; step < 10; step += 1) {
    popup.actions.answer({ getAttribute: () => "3" });
    popup.actions["survey-next"]();
  }
  const submitting = popup.renders.at(-1);
  assert.equal(submitting.view, "surveyResult");
  assert.equal(submitting.surveySubmission, "submitting");
  assert.equal(popup.state.survey.byUser.ana.completedAt, null);
  release({ ok: true });
  await settle();
  assert.equal(popup.renders.at(-1).surveySubmission, "accepted");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "submitted");
  assert.equal(popup.state.survey.byUser.ana.completedAt, "completed");
  popup.actions["survey-close"]();
  assert.equal(popup.renders.at(-1).view, "home");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "submitted");
});

for (const error of ["invalid", "server", "offline"]) {
  test(`survey ${error} submission failure shows no success and can retry`, async () => {
    let fail = true;
    const popup = await popupHarness({
      state: { session: USER, survey: { byUser: {} } },
      services: { survey: {
        status: async () => ({ ok: true, submitted: false }),
        submit: async () => (fail ? { ok: false, error } : { ok: true })
      } }
    });
    popup.actions["open-survey"]();
    await settle();
    for (let step = 0; step < 10; step += 1) {
      popup.actions.answer({ getAttribute: () => "3" });
      popup.actions["survey-next"]();
    }
    await settle();
    assert.equal(popup.renders.at(-1).surveySubmission, "error");
    assert.equal(popup.state.survey.byUser.ana.completedAt, null);
    fail = false;
    popup.actions["survey-retry"]();
    await settle();
    assert.equal(popup.renders.at(-1).surveySubmission, "accepted");
  });
}

test("duplicate submission converges to already-participated info without a POST retry", async () => {
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: async () => ({ ok: true, submitted: false }), submit: async () => ({ ok: false, error: "already_submitted" }) } }
  });
  popup.actions["open-survey"]();
  await settle();
  for (let step = 0; step < 10; step += 1) {
    popup.actions.answer({ getAttribute: () => "3" });
    popup.actions["survey-next"]();
  }
  await settle();
  assert.equal(popup.renders.at(-1).surveySubmission, "already");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "submitted");
  assert.equal(popup.state.survey.byUser.ana.completedAt, null);
});

test("switching accounts clears survey UI and loads only the target account draft", async () => {
  const popup = await popupHarness({
    state: {
      session: USER,
      survey: {
        byUser: {
          ana: { answers: [4, 2], completedAt: null },
          bea: { answers: [1, 5], completedAt: null }
        }
      }
    }
  });
  popup.actions["open-survey"]();
  await settle();
  assert.deepEqual(popup.renders.at(-1).surveyAnswers.slice(0, 2), [4, 2]);
  popup.actions.answer({ getAttribute: () => "3" });
  popup.emitState({ session: { username: "bea", isAdmin: false } });
  const switched = popup.renders.at(-1);
  assert.deepEqual(switched.surveyAnswers.slice(0, 2), [1, 5]);
  assert.equal(switched.surveyIndex, 0);
  assert.equal(switched.surveyError, null);
  popup.emitState({ session: null });
  assert.ok(popup.renders.at(-1).surveyAnswers.every((answer) => answer === null));
});

test("a late background survey status cannot hide the new account survey entry", async () => {
  let releaseAna;
  let releaseBea;
  const ana = new Promise((resolve) => { releaseAna = resolve; });
  const bea = new Promise((resolve) => { releaseBea = resolve; });
  let checks = 0;
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: () => (++checks === 1 ? ana : bea), submit: async () => ({ ok: true }) } }
  });
  popup.emitState({ session: { username: "bea", isAdmin: false }, survey: { byUser: {} } });
  releaseBea({ ok: true, submitted: false });
  await settle();
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "available");
  releaseAna({ ok: true, submitted: true });
  await settle();
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "available");
  assert.equal(popup.renders.at(-1).view, "home");
});

test("a failed background survey status stays honest and the menu action can retry", async () => {
  let offline = true;
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: {
      status: async () => (offline ? { ok: false, error: "offline" } : { ok: true, submitted: false }),
      submit: async () => ({ ok: true })
    } }
  });
  await settle();
  assert.equal(popup.renders.at(-1).view, "home");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "error");
  offline = false;
  popup.actions["open-survey"]();
  await settle();
  assert.equal(popup.renders.at(-1).view, "survey");
  assert.equal(popup.renders.at(-1).surveyMenuStatus, "available");
});

test("a late survey status response after an account switch cannot reveal the old account questionnaire", async () => {
  let releaseAna;
  let releaseBea;
  const ana = new Promise((resolve) => { releaseAna = resolve; });
  const bea = new Promise((resolve) => { releaseBea = resolve; });
  let checks = 0;
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: {} } },
    services: { survey: { status: () => (++checks === 1 ? ana : bea), submit: async () => ({ ok: true }) } }
  });
  popup.actions["open-survey"]();
  popup.emitState({ session: { username: "bea", isAdmin: false }, survey: { byUser: {} } });
  releaseBea({ ok: true, submitted: true });
  await settle();
  releaseAna({ ok: true, submitted: false });
  await settle();
  const model = popup.renders.at(-1);
  assert.equal(model.view, "surveyResult");
  assert.equal(model.surveySubmission, "already");
});

test("a late survey response after an account switch cannot clear the new account UI", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const popup = await popupHarness({
    state: { session: USER, survey: { byUser: { ana: { answers: [], completedAt: null } } } },
    services: { survey: { status: async () => ({ ok: true, submitted: false }), submit: () => pending } }
  });
  popup.actions["open-survey"]();
  await settle();
  for (let step = 0; step < 10; step += 1) {
    popup.actions.answer({ getAttribute: () => "3" });
    popup.actions["survey-next"]();
  }
  popup.emitState({
    session: { username: "bea", isAdmin: false },
    survey: { byUser: { ana: { answers: Array(10).fill(3), completedAt: null }, bea: { answers: [2], completedAt: null } } }
  });
  release({ ok: true });
  await settle();
  const model = popup.renders.at(-1);
  assert.deepEqual(model.surveyAnswers.slice(0, 1), [2]);
  assert.equal(model.surveyError, null);
  assert.equal(popup.state.survey.byUser.bea.completedAt, null);
});

test("boot renders at once and then refreshes the session through the auth port", async () => {
  const seen = [];
  const popup = await popupHarness({
    state: { session: { username: "ana", isAdmin: false } },
    accountService: { currentSession: async (services, store) => { seen.push([services, store]); return { ok: true, session: { username: "ana", isAdmin: false }, verified: true }; } }
  });
  assert.equal(popup.root.innerHTML, "home", "the first view does not wait for the backend");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen.length, 1);
  assert.ok(seen[0][1] && typeof seen[0][1].update === "function", "the store is passed to the service");
  assert.ok(popup.renders.every((model) => !model.sessionOffline));
});

test("an unreachable backend keeps the local session and shows a notice instead of blocking", async () => {
  const popup = await popupHarness({
    state: { session: { username: "ana", isAdmin: false } },
    accountService: { currentSession: async () => ({ ok: true, session: { username: "ana", isAdmin: false }, verified: false }) }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(popup.renders.at(-1).sessionOffline, true);
  assert.equal(popup.state.session.username, "ana");
  assert.equal(popup.root.innerHTML, "home");
});

test("a failing session refresh never throws and leaves the popup usable", async () => {
  for (const currentSession of [async () => { throw new Error("boom"); }, async () => ({ ok: false, error: "server" }), undefined]) {
    const popup = await popupHarness({
      state: { session: { username: "ana", isAdmin: false } },
      accountService: { currentSession }
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(popup.root.innerHTML, "home");
  }
});

test("retry-session asks again and clears the notice when the backend answers", async () => {
  let answer = { ok: true, session: { username: "ana", isAdmin: false }, verified: false };
  const popup = await popupHarness({
    state: { session: { username: "ana", isAdmin: false } },
    accountService: { currentSession: async () => answer }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(popup.renders.at(-1).sessionOffline, true);
  answer = { ok: true, session: { username: "ana", isAdmin: false }, verified: true };
  popup.actions["retry-session"]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(popup.renders.at(-1).sessionOffline, false);
});

test("arrow keys on a tab activate the neighbouring tab and move focus to it", async () => {
  const home = { getAttribute: () => "home" };
  const history = { getAttribute: () => "history" };
  const popup = await popupHarness({ items: [home, history] });
  let prevented = false;
  popup.documentListeners.keydown({ key: "ArrowRight", target: home, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(popup.renders.at(-1).view, "history");
  assert.equal(popup.focused.at(-1), '[role="tab"][data-tab="history"]');
  popup.documentListeners.keydown({ key: "Home", target: history, preventDefault: () => {} });
  assert.equal(popup.renders.at(-1).view, "home");
});

test("Escape closes the confirmation and returns focus to the control that opened it", async () => {
  const popup = await popupHarness();
  popup.actions["confirm-clear"]();
  assert.equal(popup.renders.at(-1).confirmOpen, true);
  assert.equal(popup.focused.at(-1), '[data-action="cancel-clear"]');
  popup.documentListeners.keydown({ key: "Escape", target: {} });
  assert.equal(popup.renders.at(-1).confirmOpen, false);
  assert.equal(popup.focused.at(-1), '[data-action="confirm-clear"]');
});

test("Tab is trapped inside the open confirmation and the menu returns focus on Escape", async () => {
  const popup = await popupHarness();
  popup.actions["confirm-clear"]();
  popup.documentListeners.keydown({ key: "Tab", target: {} });
  assert.equal(popup.trapped.length, 1);
  popup.actions["cancel-clear"]();
  popup.actions["toggle-menu"]();
  assert.equal(popup.focused.at(-1), ".menu-item");
  popup.documentListeners.keydown({ key: "Escape", target: {} });
  assert.equal(popup.renders.at(-1).menuOpen, false);
  assert.equal(popup.focused.at(-1), '[data-action="toggle-menu"]');
});

test("dismissing the model notice stores the version the backend reported", async () => {
  const dismissed = [];
  const popup = await popupHarness({
    state: { session: USER },
    protectionService: {
      loadModelVersion: async () => ({ ok: true, version: "2.0" }),
      dismissModelNotice: (store, version) => { dismissed.push(version); }
    }
  });
  await settle();
  popup.actions["dismiss-notice"]();
  assert.deepEqual(dismissed, ["2.0"]);
});

test("the model version is loaded once per user, not again when the notice is dismissed", async () => {
  let loads = 0;
  const popup = await popupHarness({
    state: { session: USER },
    protectionService: {
      loadModelVersion: async () => { loads += 1; return { ok: true, version: "2.0" }; },
      dismissModelNotice: (store, version) => popup.state && Object.assign(popup.state, { lastSeenModelVersion: version })
    }
  });
  await settle();
  popup.actions["dismiss-notice"]();
  await settle();
  assert.equal(loads, 1);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the actual controller without exposing its private App state.
async function popupHarness() {
  const state = { session: null, accounts: [], survey: { answers: [] }, history: {} };
  const originalState = structuredClone(state);
  const renders = [];
  const calls = [];
  const listeners = {};
  let actions;
  const root = {
    innerHTML: "",
    addEventListener: (name, handler) => { listeners[name] = handler; }
  };
  const Sereno = {
    account: { isAdmin: () => false },
    history: { ALL: "all" },
    survey: { draftAnswers: (answers) => [...answers] },
    onboarding: { isDone: () => true },
    preferences: { read: () => null, write: (...args) => calls.push(["preferences.write", ...args]) },
    stateStore: { open: () => ({
      subscribe: (handler) => handler(state),
      ready: () => Promise.resolve(state),
      update: (mutate) => {
        calls.push(["store.update"]);
        Object.assign(state, mutate(state));
        return Promise.resolve();
      }
    }) },
    time: { stamp: () => { calls.push(["completedAt"]); return "completed"; } },
    accountService: {
      login: () => { calls.push(["login"]); return Promise.resolve({ ok: false }); },
      register: () => { calls.push(["register"]); return Promise.resolve({ ok: false }); }
    },
    popupViews: { page: (model) => { renders.push({ ...model, surveyAnswers: [...model.surveyAnswers] }); return model.view; } },
    ui: {
      delegateActions: (_root, handlers) => { actions = handlers; },
      onReady: (init) => init()
    }
  };
  const context = vm.createContext({
    Sereno,
    document: { getElementById: () => root, addEventListener: () => {} }
  });
  for (const file of ["survey/domain/sus.js", "survey/application/survey-service.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/popup/popup-page.js"), "utf8"), context);
  await Promise.resolve();
  return { actions, listeners, state, originalState, calls, renders, root };
}

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
    const popup = await popupHarness();
    popup.actions["open-survey"]();
    for (let step = 0; step <= index; step += 1) {
      popup.actions.answer({ getAttribute: () => "3" });
      if (step < index) popup.actions["survey-next"]();
    }
    assert.equal(popup.renders.at(-1).surveyIndex, index);
    const savedAnswers = Array.from(popup.state.survey.answers);
    const writesBeforeExit = popup.calls.length;
    popup.actions["survey-close"]();
    assert.equal(popup.root.innerHTML, "home");
    assert.equal(popup.renders.at(-1).tab, "home");
    assert.equal(popup.calls.length, writesBeforeExit);
    assert.deepEqual(Array.from(popup.state.survey.answers), savedAnswers);
    assert.equal(popup.state.survey.completedAt, undefined);
    assert.ok(popup.calls.every(([call]) => call === "store.update"));
    popup.actions["open-survey"]();
    assert.equal(popup.renders.at(-1).surveyIndex, 0);
    assert.deepEqual(popup.renders.at(-1).surveyAnswers, savedAnswers);
  });
}

test("survey previous-question action still navigates questions without exiting or saving", async () => {
  const popup = await popupHarness();
  popup.actions["open-survey"]();
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

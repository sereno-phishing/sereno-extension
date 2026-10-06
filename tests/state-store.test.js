"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const { storage, stateStore } = load("platform/storage.js", "platform/state-store.js");

const KEY = "sereno.state.v1";

function memoryWithWatch() {
  const base = storage.memoryStorage();
  let onExternal = null;
  base.watch = (key, callback) => {
    onExternal = callback;
  };
  return { storage: base, external: (value) => onExternal(value) };
}

test("defaults fill keys missing from storage", async () => {
  const mem = storage.memoryStorage();
  await mem.set(KEY, { onboardingDone: true });
  const store = stateStore.create({ storage: mem, key: KEY, defaults: { onboardingDone: false, session: null } });
  assert.deepEqual(await store.ready(), { onboardingDone: true, session: null });
});

test("set persists and notifies subscribers with a snapshot", async () => {
  const mem = storage.memoryStorage();
  const store = stateStore.create({ storage: mem, key: KEY, defaults: { a: 1 } });
  const seen = [];
  store.subscribe((state) => seen.push(state));
  await store.set({ b: 2 });
  assert.deepEqual(await mem.get(KEY), { a: 1, b: 2 });
  assert.deepEqual(seen, [{ a: 1, b: 2 }]);
  seen[0].a = 99;
  assert.equal((await store.get()).a, 1);
});

test("a mutation keeps data written to storage by another page", async () => {
  const mem = storage.memoryStorage();
  const store = stateStore.create({ storage: mem, key: KEY, defaults: { domains: [], flag: false } });
  await store.ready();
  await mem.set(KEY, { domains: ["externo.pe"], flag: false });
  await store.set({ flag: true });
  assert.deepEqual(await mem.get(KEY), { domains: ["externo.pe"], flag: true });
});

test("concurrent updates are serialized", async () => {
  const mem = storage.memoryStorage();
  const store = stateStore.create({ storage: mem, key: KEY, defaults: { count: 0 } });
  await Promise.all([1, 2, 3, 4, 5].map(() => store.update((state) => ({ count: state.count + 1 }))));
  assert.equal((await store.get()).count, 5);
});

test("transact returns its result and persists nothing without a patch", async () => {
  const mem = storage.memoryStorage();
  const store = stateStore.create({ storage: mem, key: KEY, defaults: { a: 1 } });
  assert.equal(await store.transact(() => ({ result: "read-only" })), "read-only");
  assert.equal(await mem.get(KEY), undefined);
  assert.equal(await store.transact((state) => ({ patch: { a: state.a + 1 }, result: "ok" })), "ok");
  assert.deepEqual(await mem.get(KEY), { a: 2 });
});

test("external writes notify listeners once and ignore echoes", async () => {
  const { storage: mem, external } = memoryWithWatch();
  const store = stateStore.create({ storage: mem, key: KEY, defaults: { a: 1 } });
  await store.ready();
  const seen = [];
  store.subscribe((state) => seen.push(state));
  external({ a: 1 });
  external({ a: 5 });
  assert.deepEqual(seen, [{ a: 5 }]);
});

/* Platform · reactive state store shared by every extension page. Classic
   script that registers Sereno.stateStore.
   The store is the port application use cases receive:
     ready()/get()      -> Promise<state snapshot>
     set(patch)         -> merges a top-level patch and persists it
     update(fn)         -> fn(snapshot) returns the patch to merge
     transact(fn)       -> fn(snapshot) returns { patch?, result }; resolves result
     subscribe(cb)      -> cb(snapshot) after every change; returns unsubscribe
   Every mutation re-reads storage first and runs in a serial queue, because
   another page (popup, admin panel, demo store) may have written meanwhile
   and the whole state is persisted on each commit. */

(function (Sereno) {
  "use strict";

  var STORAGE_KEY = "sereno.state.v1";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function create(options) {
    var storage = options.storage;
    var key = options.key;
    var defaults = options.defaults || {};

    var state = null;
    var loadPromise = null;
    var queue = Promise.resolve();
    var listeners = [];

    function fromStored(stored) {
      var base = clone(defaults);
      if (stored && typeof stored === "object") {
        Object.keys(stored).forEach(function (name) {
          if (stored[name] !== undefined) {
            base[name] = stored[name];
          }
        });
      }
      return base;
    }

    function load() {
      if (!loadPromise) {
        loadPromise = storage.get(key).then(function (stored) {
          state = fromStored(stored);
          return clone(state);
        });
      }
      return loadPromise;
    }

    function refresh() {
      return storage.get(key).then(function (stored) {
        state = fromStored(stored);
      });
    }

    function notify() {
      var snapshot = clone(state);
      listeners.slice().forEach(function (callback) {
        try {
          callback(snapshot);
        } catch (error) {
          /* a broken listener must not break the store */
        }
      });
    }

    /* Applies a write made by another page; skips echoes of this page's own writes. */
    function applyExternal(stored) {
      if (!state) {
        return;
      }
      var next = fromStored(stored);
      if (JSON.stringify(next) === JSON.stringify(state)) {
        return;
      }
      state = next;
      notify();
    }

    function commit(patch) {
      if (patch) {
        state = Object.assign({}, state, patch);
      }
      return storage.set(key, clone(state)).then(function () {
        if (patch) {
          notify();
        }
      });
    }

    /* Serializes every mutation so concurrent callers never lose updates. */
    function enqueue(task) {
      var run = queue
        .then(load)
        .then(refresh)
        .then(task);
      queue = run.then(function () {}, function () {});
      return run;
    }

    function get() {
      return load().then(function () {
        return clone(state);
      });
    }

    function set(patch) {
      return enqueue(function () {
        return commit(patch);
      });
    }

    function update(fn) {
      return enqueue(function () {
        return commit(fn(clone(state)));
      });
    }

    /* A transaction without a patch only reads: nothing is persisted. */
    function transact(fn) {
      return enqueue(function () {
        var outcome = fn(clone(state)) || {};
        if (!outcome.patch) {
          return outcome.result;
        }
        return commit(outcome.patch).then(function () {
          return outcome.result;
        });
      });
    }

    function subscribe(callback) {
      listeners.push(callback);
      return function unsubscribe() {
        var index = listeners.indexOf(callback);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    }

    if (typeof storage.watch === "function") {
      storage.watch(key, applyExternal);
    }

    return {
      ready: get,
      get: get,
      set: set,
      update: update,
      transact: transact,
      subscribe: subscribe
    };
  }

  /* The store every page opens: detected storage, shared key, seed defaults. */
  function open() {
    return create({ storage: Sereno.storage.detect(), key: STORAGE_KEY, defaults: Sereno.seed.defaultState });
  }

  Sereno.stateStore = {
    STORAGE_KEY: STORAGE_KEY,
    create: create,
    open: open
  };
})(globalThis.Sereno = globalThis.Sereno || {});

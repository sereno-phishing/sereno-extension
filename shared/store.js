/* Sereno state layer. Classic script: exposes window.SerenoStore.
   Uses chrome.storage.local when running as an extension, otherwise falls back
   to window.localStorage and finally to in-memory storage, so the same async
   API can be exercised from a Node DOM harness. */

(function () {
  "use strict";

  var DATA = (typeof window !== "undefined" && window.SERENO_DATA) || {};
  var DEFAULT_STATE = DATA.defaultState || {};
  var STORAGE_KEY = "sereno.state.v1";

  /* ---------------- storage driver ---------------- */

  var hasChromeStorage =
    typeof chrome !== "undefined" &&
    chrome &&
    chrome.storage &&
    chrome.storage.local &&
    typeof chrome.storage.local.get === "function";

  var driver;

  if (hasChromeStorage) {
    driver = {
      get: function (key) {
        return new Promise(function (resolve) {
          chrome.storage.local.get(key, function (result) {
            resolve(result ? result[key] : undefined);
          });
        });
      },
      set: function (key, value) {
        return new Promise(function (resolve) {
          var payload = {};
          payload[key] = value;
          chrome.storage.local.set(payload, function () {
            resolve();
          });
        });
      }
    };
  } else if (typeof localStorage !== "undefined") {
    driver = {
      get: function (key) {
        try {
          var raw = localStorage.getItem(key);
          return Promise.resolve(raw ? JSON.parse(raw) : undefined);
        } catch (error) {
          return Promise.resolve(undefined);
        }
      },
      set: function (key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
          /* quota or private mode: keep the in-memory mirror only */
        }
        return Promise.resolve();
      }
    };
  } else {
    var memory = {};
    driver = {
      get: function (key) {
        return Promise.resolve(memory[key]);
      },
      set: function (key, value) {
        memory[key] = value;
        return Promise.resolve();
      }
    };
  }

  /* ---------------- internal state ---------------- */

  var state = null;
  var loadPromise = null;
  var queue = Promise.resolve();
  var listeners = [];

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function pad2(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function load() {
    if (!loadPromise) {
      loadPromise = driver.get(STORAGE_KEY).then(function (stored) {
        var base = clone(DEFAULT_STATE);
        if (stored && typeof stored === "object") {
          Object.keys(stored).forEach(function (key) {
            if (stored[key] !== undefined) {
              base[key] = stored[key];
            }
          });
        }
        state = base;
        return clone(state);
      });
    }
    return loadPromise;
  }

  function persist() {
    return driver.set(STORAGE_KEY, clone(state));
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

  function commit(patch) {
    if (patch) {
      state = Object.assign({}, state, patch);
    }
    return persist().then(function () {
      if (patch) {
        notify();
      }
    });
  }

  /* Serializes every mutation so concurrent callers never lose updates. */
  function enqueue(task) {
    var run = queue.then(function () {
      return load();
    }).then(function () {
      return task();
    });
    queue = run.then(function () {}, function () {});
    return run;
  }

  function findUserSync(username) {
    if (!state || !state.users) {
      return null;
    }
    var found = null;
    state.users.forEach(function (user) {
      if (user.username === username) {
        found = user;
      }
    });
    return found;
  }

  /* ---------------- public API ---------------- */

  function ready() {
    return load().then(function () {
      return clone(state);
    });
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
      var patch = fn(clone(state));
      return commit(patch);
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

  /* ---------------- date + text helpers ---------------- */

  function todayStamp() {
    var now = new Date();
    return (
      now.getFullYear() +
      "-" +
      pad2(now.getMonth() + 1) +
      "-" +
      pad2(now.getDate()) +
      "T" +
      pad2(now.getHours()) +
      ":" +
      pad2(now.getMinutes())
    );
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return iso || "";
    }
    return (
      pad2(date.getDate()) +
      "/" +
      pad2(date.getMonth() + 1) +
      "/" +
      date.getFullYear() +
      " " +
      pad2(date.getHours()) +
      ":" +
      pad2(date.getMinutes())
    );
  }

  function formatDateShort(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return iso || "";
    }
    return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear();
  }

  function initials(username) {
    var name = String(username || "").trim();
    if (!name) {
      return "?";
    }
    var parts = name.split(/[.\s_-]+/).filter(function (part) {
      return part.length > 0;
    });
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  /* ---------------- session helpers ---------------- */

  function publicUser(user) {
    return { username: user.username, role: user.role, createdAt: user.createdAt };
  }

  function login(username, password) {
    return enqueue(function () {
      var user = findUserSync(username);
      if (!user || user.password !== password) {
        return { ok: false, error: "invalid" };
      }
      return commit({
        session: { username: user.username, role: user.role, loginAt: todayStamp() }
      }).then(function () {
        return { ok: true, user: publicUser(user) };
      });
    });
  }

  function register(username, password) {
    return enqueue(function () {
      if (findUserSync(username)) {
        return { ok: false, error: "duplicate" };
      }
      var user = {
        username: username,
        password: password,
        role: "usuario",
        createdAt: todayStamp()
      };
      return commit({
        users: state.users.concat([user]),
        session: { username: user.username, role: user.role, loginAt: todayStamp() }
      }).then(function () {
        return { ok: true };
      });
    });
  }

  function logout() {
    return set({ session: null });
  }

  function findUser(username) {
    var user = findUserSync(username);
    return user ? clone(user) : null;
  }

  /* ---------------- history helpers ---------------- */

  function appendHistory(username, entry) {
    return update(function (current) {
      var list = (current.history && current.history[username] ? current.history[username] : []).slice();
      var stamp = entry.ts || todayStamp();
      var stampMs = Date.parse(stamp);
      var duplicateIndex = -1;

      for (var index = 0; index < list.length; index += 1) {
        var candidate = list[index];
        if (candidate.domain === entry.domain && candidate.status === entry.status) {
          var candidateMs = Date.parse(candidate.ts);
          if (!isNaN(stampMs) && !isNaN(candidateMs) && Math.abs(candidateMs - stampMs) <= 60000) {
            duplicateIndex = index;
            break;
          }
        }
      }

      var record = {
        id: entry.id || "h-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        domain: entry.domain,
        status: entry.status,
        score: entry.score,
        source: entry.source || "modelo",
        ts: stamp,
        latencyMs: entry.latencyMs === undefined ? null : entry.latencyMs
      };

      if (duplicateIndex >= 0) {
        list.splice(duplicateIndex, 1);
      }
      list.unshift(record);
      list = list.slice(0, 200);

      var history = Object.assign({}, current.history);
      history[username] = list;
      return { history: history };
    });
  }

  function clearHistory(username) {
    return update(function (current) {
      var history = Object.assign({}, current.history);
      history[username] = [];
      return { history: history };
    });
  }

  window.SerenoStore = {
    ready: ready,
    get: get,
    set: set,
    update: update,
    subscribe: subscribe,
    todayStamp: todayStamp,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    initials: initials,
    login: login,
    register: register,
    logout: logout,
    appendHistory: appendHistory,
    clearHistory: clearHistory,
    findUser: findUser
  };
})();

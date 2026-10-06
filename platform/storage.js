/* Platform · key-value storage port and its adapters. Classic script that
   registers Sereno.storage.
   Port: { get(key) -> Promise<value>, set(key, value) -> Promise,
           watch(key, onExternalValue) } where watch reports writes made by
   other extension pages. detect() picks chrome.storage.local inside the
   extension, window.localStorage when a page is opened from file://, and
   memory otherwise (Node). */

(function (Sereno) {
  "use strict";

  function chromeStorage(area, onChanged) {
    return {
      get: function (key) {
        return new Promise(function (resolve) {
          area.get(key, function (result) {
            resolve(result ? result[key] : undefined);
          });
        });
      },
      set: function (key, value) {
        return new Promise(function (resolve) {
          var payload = {};
          payload[key] = value;
          area.set(payload, function () {
            resolve();
          });
        });
      },
      watch: function (key, onExternalValue) {
        if (!onChanged) {
          return;
        }
        onChanged.addListener(function (changes, areaName) {
          if (areaName === "local" && changes[key]) {
            onExternalValue(changes[key].newValue);
          }
        });
      }
    };
  }

  function webStorage(storage, eventTarget) {
    return {
      get: function (key) {
        try {
          var raw = storage.getItem(key);
          return Promise.resolve(raw ? JSON.parse(raw) : undefined);
        } catch (error) {
          return Promise.resolve(undefined);
        }
      },
      set: function (key, value) {
        try {
          storage.setItem(key, JSON.stringify(value));
        } catch (error) {
          /* quota or private mode: keep the in-memory mirror only */
        }
        return Promise.resolve();
      },
      watch: function (key, onExternalValue) {
        if (!eventTarget || typeof eventTarget.addEventListener !== "function") {
          return;
        }
        eventTarget.addEventListener("storage", function (event) {
          if (event.key !== key) {
            return;
          }
          try {
            onExternalValue(event.newValue ? JSON.parse(event.newValue) : undefined);
          } catch (error) {
            /* ignore malformed external writes */
          }
        });
      }
    };
  }

  function memoryStorage() {
    var memory = {};
    return {
      get: function (key) {
        return Promise.resolve(memory[key]);
      },
      set: function (key, value) {
        memory[key] = value;
        return Promise.resolve();
      },
      watch: function () {}
    };
  }

  function detect() {
    var ext = typeof chrome !== "undefined" ? chrome : null;
    if (ext && ext.storage && ext.storage.local && typeof ext.storage.local.get === "function") {
      return chromeStorage(ext.storage.local, ext.storage.onChanged);
    }
    if (typeof localStorage !== "undefined") {
      return webStorage(localStorage, typeof window !== "undefined" ? window : null);
    }
    return memoryStorage();
  }

  Sereno.storage = {
    chromeStorage: chromeStorage,
    webStorage: webStorage,
    memoryStorage: memoryStorage,
    detect: detect
  };
})(globalThis.Sereno = globalThis.Sereno || {});

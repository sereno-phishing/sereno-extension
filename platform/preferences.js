/* Platform · per-page UI preferences (for example the last popup tab) kept in
   window.localStorage. Best effort: private mode or malformed values simply
   read as null. Classic script that registers Sereno.preferences. */

(function (Sereno) {
  "use strict";

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* private mode: UI persistence is best effort */
    }
  }

  Sereno.preferences = {
    read: read,
    write: write
  };
})(globalThis.Sereno = globalThis.Sereno || {});

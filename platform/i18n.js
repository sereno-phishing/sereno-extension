/* Shared language preference. Translation catalogs are presentation-only. */
(function (Sereno) {
  "use strict";

  var KEY = "sereno.language.v1";
  var catalog = Object.create(null);
  var activeLanguage = "es";

  function use(language) {
    activeLanguage = language === "en" ? "en" : "es";
  }

  function t(key) {
    return message(key, activeLanguage);
  }

  function register(entries) {
    Object.keys(entries).forEach(function (key) {
      var entry = entries[key];
      catalog[key] = { es: entry.es, en: entry.en };
    });
  }

  register({ "language.label": { es: "Idioma", en: "Language" } });

  function message(key, language) {
    var entry = catalog[key];
    return entry ? entry[language] || entry.es || key : key;
  }

  function resolveLanguage(preference, browserLanguage) {
    if (preference === "es" || preference === "en") return preference;
    return /^en(?:-|$)/i.test(browserLanguage || "") ? "en" : "es";
  }

  function create(storage, browserLanguage) {
    var current = resolveLanguage(null, browserLanguage);
    var listeners = [];
    var revision = 0;
    function apply(value) {
      var next = resolveLanguage(value, browserLanguage);
      if (next !== current) {
        current = next;
        listeners.slice().forEach(function (listener) { listener(current); });
      }
    }
    if (typeof storage.watch === "function") storage.watch(KEY, function (value) {
      revision += 1;
      apply(value);
    });
    return {
      ready: async function () {
        var before = revision;
        var value = await storage.get(KEY);
        if (before === revision) apply(value);
        return current;
      },
      get: function () { return current; },
      set: async function (language) {
        if (language !== "es" && language !== "en") throw new Error("Unsupported language");
        revision += 1;
        var before = revision;
        await storage.set(KEY, language);
        if (before === revision) apply(language);
      },
      subscribe: function (listener) {
        listeners.push(listener);
        return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
      }
    };
  }

  Sereno.i18n = { KEY: KEY, resolveLanguage: resolveLanguage, create: create, register: register, message: message, use: use, t: t };
})(globalThis.Sereno = globalThis.Sereno || {});

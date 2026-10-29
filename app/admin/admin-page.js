/* Admin panel · container: restores the backend session before authorizing,
   owns the panel UI state, delegates actions to administration use cases and
   re-renders through Sereno.adminViews. Classic script; no inline handlers. */

(function () {
  "use strict";

  var time = Sereno.time;
  var domainPolicy = Sereno.domainPolicy;
  var admin = Sereno.administrationService;
  var accountService = Sereno.accountService;
  var store = Sereno.stateStore.open();
  var services = Sereno.services;
  var language = Sereno.i18n && Sereno.storage ? Sereno.i18n.create(Sereno.storage.detect(), typeof navigator !== "undefined" ? navigator.language : "es") : null;
  var pageMessages = {
    "admin.page.title": { es: "Sereno — Administración", en: "Sereno — Administration" },
    "admin.page.loading": { es: "Cargando el panel...", en: "Loading the panel..." }
  };
  if (Sereno.i18n) Sereno.i18n.register(pageMessages);

  function applyLanguage(value) {
    if (Sereno.i18n && Sereno.i18n.use) Sereno.i18n.use(value);
    if (document.documentElement) document.documentElement.lang = value;
    document.title = Sereno.i18n ? Sereno.i18n.t("admin.page.title") : pageMessages["admin.page.title"].es;
    if (!App.state && root) root.innerHTML = '<div class="card panel-status" role="status">' + Sereno.ui.esc(Sereno.i18n ? Sereno.i18n.t("admin.page.loading") : pageMessages["admin.page.loading"].es) + '</div>';
    if (App.state && root) {
      var inputs = root.querySelectorAll ? Array.prototype.map.call(root.querySelectorAll("input[name]"), function (input) { return { name: input.name, value: input.value }; }) : [];
      render();
      inputs.forEach(function (saved) {
        var input = root.querySelector('[name="' + saved.name + '"]');
        if (input) input.value = saved.value;
      });
    }
  }

  var NOTICE_MS = 2600;

  function sectionFromHash(hash) {
    var section = hash.slice(1);
    return ["metricas", "dominios", "cache"].indexOf(section) !== -1 ? section : "metricas";
  }

  var App = {
    initialized: false,
    state: null,
    authorization: "checking",
    section: sectionFromHash(window.location.hash),
    showAllQueries: false,
    addPolicy: domainPolicy.DEFAULT_POLICY,
    metrics: null,
    cache: null,
    domainsStored: [],
    domainsDraft: [],
    load: {
      metricas: { status: "loading" },
      dominios: { status: "loading" },
      cache: { status: "loading" }
    },
    domainsBanner: false,
    domainsError: "",
    domainsErrorCode: null,
    cacheNotice: "",
    cacheError: "",
    cacheErrorCode: null,
    loadErrors: {}
  };

  var root = null;
  var verificationSequence = 0;
  var dataSequence = 0;
  var observedSessionKey = null;
  var authorizedSessionKey = null;

  function sessionKey(session) {
    if (!session) {
      return "signed-out";
    }
    return [session.username, session.role, session.token || "", session.loginAt || ""].join("|");
  }

  function resetPrivilegedState() {
    App.metrics = null;
    App.cache = null;
    App.domainsStored = [];
    App.domainsDraft = [];
    App.domainsBanner = false;
    App.domainsError = "";
    App.domainsErrorCode = null;
    App.cacheNotice = "";
    App.cacheError = "";
    App.cacheErrorCode = null;
    App.loadErrors = {};
    App.load = {
      metricas: { status: "loading" },
      dominios: { status: "loading" },
      cache: { status: "loading" }
    };
  }

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    var restoreFocus = Sereno.ui.captureFocus(root);
    root.innerHTML = Sereno.adminViews.page(App, App.state);
    restoreFocus();
  }

  function timedNotice(field, hiddenValue) {
    var timer = null;
    return function show(value) {
      App[field] = value;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(function () {
        timer = null;
        App[field] = hiddenValue;
        render();
      }, NOTICE_MS);
    };
  }

  var showDomainsBanner = timedNotice("domainsBanner", false);
  var showCacheNotice = timedNotice("cacheNotice", "");

  function readValue(name) {
    var input = root.querySelector('[name="' + name + '"]');
    return input ? input.value : "";
  }

  function readDomain(name) {
    var input = root.querySelector('[name="' + name + '"]');
    var domain = domainPolicy.normalizeDomain(input ? input.value : "");
    if (!domain && input) {
      input.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
    }
    return domain;
  }

  function today() {
    return time.isoDay(new Date());
  }

  function authorizedSnapshot() {
    var key = sessionKey(App.state && App.state.session);
    if (App.authorization !== "authorized" || !Sereno.account.isAdmin(App.state && App.state.session) || key !== authorizedSessionKey) {
      return null;
    }
    return { sequence: dataSequence, sessionKey: key };
  }

  function snapshotIsCurrent(snapshot) {
    return !!snapshot && snapshot.sequence === dataSequence && snapshot.sessionKey === authorizedSessionKey && !!authorizedSnapshot();
  }

  async function loadSection(id, snapshot) {
    var access = snapshot || authorizedSnapshot();
    if (!snapshotIsCurrent(access)) {
      return;
    }
    App.load[id] = { status: "loading" };
    delete App.loadErrors[id];
    render();
    var result;
    if (id === "dominios") {
      result = await admin.loadDomains(services);
    } else if (id === "cache") {
      result = await admin.loadCache(services);
    } else {
      result = await admin.loadMetrics(services);
    }
    if (!snapshotIsCurrent(access)) {
      return;
    }
    if (result.ok && id === "dominios") {
      App.domainsStored = result.domains;
      App.domainsDraft = result.domains.map(domainPolicy.toRow);
    } else if (result.ok && id === "cache") {
      App.cache = result.cache;
    } else if (result.ok) {
      App.metrics = result.metrics;
    }
    App.load[id] = result.ok ? { status: "ready" } : { status: "error", message: result.message };
    App.loadErrors[id] = result.ok ? null : result.error;
    render();
  }

  function loadAll() {
    var snapshot = authorizedSnapshot();
    if (!snapshot) {
      return;
    }
    ["metricas", "dominios", "cache"].forEach(function (id) {
      loadSection(id, snapshot);
    });
  }

  async function verifySession(state) {
    var attempt = ++verificationSequence;
    dataSequence += 1;
    authorizedSessionKey = null;
    App.state = state;
    App.authorization = "checking";
    resetPrivilegedState();
    render();

    var result;
    try {
      result = await accountService.currentSession(services, store);
    } catch (error) {
      result = null;
    }
    if (attempt !== verificationSequence) {
      return;
    }

    var session = result && result.ok ? result.session : null;
    App.state = Object.assign({}, state, { session: session });
    observedSessionKey = sessionKey(session);
    if (!result || !result.ok || !result.verified || !Sereno.account.isAdmin(session)) {
      App.authorization = "denied";
      resetPrivilegedState();
      render();
      return;
    }

    App.authorization = "authorized";
    authorizedSessionKey = observedSessionKey;
    render();
    loadAll();
  }

  function observeState(state) {
    var nextKey = sessionKey(state && state.session);
    App.state = state;
    if (nextKey === observedSessionKey) {
      render();
      return;
    }
    observedSessionKey = nextKey;
    verifySession(state);
  }

  async function addDomain() {
    var access = authorizedSnapshot();
    if (!access) {
      return;
    }
    var domain = readDomain("newDomain");
    if (!domain) {
      return;
    }
    var outcome = domainPolicy.addRow(App.domainsDraft || [], domain, App.addPolicy, today());
    App.addPolicy = domainPolicy.DEFAULT_POLICY;
    App.domainsError = "";
    App.domainsErrorCode = null;
    if (!outcome.added) {
      render();
      return;
    }
    App.domainsDraft = outcome.rows;
    render();
    var result = await admin.addDomain(services, outcome.added);
    if (!snapshotIsCurrent(access)) {
      return;
    }
    if (result.ok) {
      App.domainsStored = result.domains;
    } else {
      App.domainsError = result.message;
      App.domainsErrorCode = result.error;
    }
    render();
  }

  async function saveDomains() {
    var access = authorizedSnapshot();
    if (!access) {
      return;
    }
    var next = domainPolicy.stampChanges(App.domainsDraft || [], App.domainsStored, today());
    App.domainsDraft = next;
    App.domainsError = "";
    App.domainsErrorCode = null;
    var result = await admin.saveDomains(services, next);
    if (!snapshotIsCurrent(access)) {
      return;
    }
    if (result.ok) {
      App.domainsStored = next;
      showDomainsBanner(true);
    } else {
      App.domainsError = result.message;
      App.domainsErrorCode = result.error;
    }
    render();
  }

  async function saveTtl() {
    var access = authorizedSnapshot();
    if (!access) {
      return;
    }
    App.cacheError = "";
    App.cacheErrorCode = null;
    var result = await admin.saveTtl(services, readValue("ttlPhishingDays"), readValue("ttlLegitHours"));
    if (!snapshotIsCurrent(access)) {
      return;
    }
    if (result.ok) {
      App.cache = result.cache;
      showCacheNotice("TTL guardado.");
    } else {
      App.cacheError = result.message;
      App.cacheErrorCode = result.error;
    }
    render();
  }

  async function invalidateDomain() {
    var access = authorizedSnapshot();
    if (!access) {
      return;
    }
    var domain = readDomain("invalidateDomain");
    if (!domain) {
      return;
    }
    App.cacheError = "";
    App.cacheErrorCode = null;
    var result = await admin.invalidateDomain(services, domain);
    if (!snapshotIsCurrent(access)) {
      return;
    }
    if (result.ok) {
      App.cache = result.cache;
      showCacheNotice({ domain: domain });
    } else {
      App.cacheError = result.message;
      App.cacheErrorCode = result.error;
    }
    render();
  }

  var ACTIONS = {
    nav: function (target) {
      if (!authorizedSnapshot()) {
        return;
      }
      window.location.hash = "#" + sectionFromHash("#" + (target.getAttribute("data-section") || ""));
    },
    "toggle-queries": function () {
      if (!authorizedSnapshot()) {
        return;
      }
      App.showAllQueries = !App.showAllQueries;
      render();
    },
    "pick-add-policy": function (target) {
      if (!authorizedSnapshot()) {
        return;
      }
      var draft = readValue("newDomain");
      App.addPolicy = domainPolicy.policyOrDefault(target.getAttribute("data-policy"));
      render();
      var input = root.querySelector('[name="newDomain"]');
      if (input) {
        input.value = draft;
      }
    },
    "add-domain": addDomain,
    "pick-row-policy": function (target) {
      if (!authorizedSnapshot()) {
        return;
      }
      var policy = target.getAttribute("data-policy");
      if (!domainPolicy.isPolicy(policy)) {
        return;
      }
      App.domainsDraft = domainPolicy.withPolicy(App.domainsDraft || [], target.getAttribute("data-domain"), policy);
      render();
    },
    "remove-domain": function (target) {
      if (!authorizedSnapshot()) {
        return;
      }
      App.domainsDraft = domainPolicy.without(App.domainsDraft || [], target.getAttribute("data-domain"));
      render();
    },
    "save-domains": saveDomains,
    "save-ttl": saveTtl,
    "invalidate-domain": invalidateDomain,
    retry: function (target) {
      loadSection(target.getAttribute("data-section") || "metricas");
    }
  };

  async function init() {
    if (App.initialized) {
      return;
    }
    root = document.getElementById("app");
    if (!root) {
      return;
    }
    App.initialized = true;
    if (language) {
      language.subscribe(applyLanguage);
      applyLanguage(language.get());
      try {
        await language.ready();
        applyLanguage(language.get());
      } catch (error) {
        applyLanguage(language.get());
      }
    }
    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#main") {
        return;
      }
      App.section = sectionFromHash(window.location.hash);
      render();
    });
    Sereno.ui.delegateActions(root, ACTIONS);
    store.subscribe(observeState);
    var state = await store.ready();
    observedSessionKey = sessionKey(state.session);
    await verifySession(state);
  }

  Sereno.ui.onReady(init);
})();

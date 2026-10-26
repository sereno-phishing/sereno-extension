/* Admin panel · container: owns the panel UI state (section, policy draft,
   notices), subscribes to the shared store, delegates data-action clicks to
   the administration use cases and re-renders through Sereno.adminViews.
   Classic script. No inline handlers (MV3 CSP). */

(function () {
  "use strict";

  var time = Sereno.time;
  var domainPolicy = Sereno.domainPolicy;
  var admin = Sereno.administrationService;
  var store = Sereno.stateStore.open();
  // The composition root: policies, cache and metrics go through its data port.
  var services = Sereno.services;

  var NOTICE_MS = 2600;

  var App = {
    initialized: false,
    state: null,
    section: "metricas",
    showAllQueries: false,
    addPolicy: domainPolicy.DEFAULT_POLICY,
    // Backend-owned data, as the data port returned it, and the load state of each section.
    metrics: null,
    cache: null,
    domainsStored: [],
    domainsDraft: null,
    load: {
      metricas: { status: "loading" },
      dominios: { status: "loading" },
      cache: { status: "loading" }
    },
    domainsBanner: false,
    domainsError: "",
    cacheNotice: "",
    cacheError: ""
  };
  var loadStarted = false;

  var root = null;

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    var restoreFocus = Sereno.ui.captureFocus(root);
    root.innerHTML = Sereno.adminViews.page(App, App.state);
    restoreFocus();
  }

  /* A notice that hides itself after NOTICE_MS; showing it again restarts the timer. */
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

  /* Normalized domain typed in the named input, or "" after flagging the input as invalid. */
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

  /* ---------------- loading ---------------- */

  /* Loads one section through the port; the others keep what they show. */
  async function loadSection(id) {
    App.load[id] = { status: "loading" };
    render();
    var result;
    if (id === "dominios") {
      result = await admin.loadDomains(services);
      if (result.ok) {
        App.domainsStored = result.domains;
        App.domainsDraft = result.domains.map(domainPolicy.toRow);
      }
    } else if (id === "cache") {
      result = await admin.loadCache(services);
      if (result.ok) {
        App.cache = result.cache;
      }
    } else {
      result = await admin.loadMetrics(services);
      if (result.ok) {
        App.metrics = result.metrics;
      }
    }
    App.load[id] = result.ok ? { status: "ready" } : { status: "error", message: result.message };
    render();
  }

  /* The panel is for administrators: nothing is requested before one is signed in. */
  function loadAll() {
    if (loadStarted || !Sereno.account.isAdmin(App.state && App.state.session)) {
      return;
    }
    loadStarted = true;
    ["metricas", "dominios", "cache"].forEach(loadSection);
  }

  /* ---------------- actions ---------------- */

  async function addDomain() {
    var domain = readDomain("newDomain");
    if (!domain) {
      return;
    }
    var outcome = domainPolicy.addRow(App.domainsDraft || [], domain, App.addPolicy, today());
    App.addPolicy = domainPolicy.DEFAULT_POLICY;
    App.domainsError = "";
    if (!outcome.added) {
      render();
      return;
    }
    App.domainsDraft = outcome.rows;
    render();
    var result = await admin.addDomain(services, outcome.added);
    if (result.ok) {
      App.domainsStored = result.domains;
    } else {
      App.domainsError = result.message;
    }
    render();
  }

  async function saveDomains() {
    var next = domainPolicy.stampChanges(App.domainsDraft || [], App.domainsStored, today());
    App.domainsDraft = next;
    App.domainsError = "";
    var result = await admin.saveDomains(services, next);
    if (result.ok) {
      App.domainsStored = next;
      showDomainsBanner(true);
    } else {
      App.domainsError = result.message;
    }
    render();
  }

  async function saveTtl() {
    App.cacheError = "";
    var result = await admin.saveTtl(services, readValue("ttlPhishingDays"), readValue("ttlLegitHours"));
    if (result.ok) {
      App.cache = result.cache;
      showCacheNotice("TTL guardado.");
    } else {
      App.cacheError = result.message;
    }
    render();
  }

  async function invalidateDomain() {
    var domain = readDomain("invalidateDomain");
    if (!domain) {
      return;
    }
    App.cacheError = "";
    var result = await admin.invalidateDomain(services, domain);
    if (result.ok) {
      App.cache = result.cache;
      showCacheNotice(domain + " se invalidó. La siguiente consulta irá al modelo.");
    } else {
      App.cacheError = result.message;
    }
    render();
  }

  /* Command table: data-action name -> handler(target). */
  var ACTIONS = {
    nav: function (target) {
      App.section = target.getAttribute("data-section") || "metricas";
      render();
    },
    "toggle-queries": function () {
      App.showAllQueries = !App.showAllQueries;
      render();
    },
    "pick-add-policy": function (target) {
      App.addPolicy = domainPolicy.policyOrDefault(target.getAttribute("data-policy"));
      render();
    },
    "add-domain": addDomain,
    "pick-row-policy": function (target) {
      var policy = target.getAttribute("data-policy");
      if (!domainPolicy.isPolicy(policy)) {
        return;
      }
      App.domainsDraft = domainPolicy.withPolicy(App.domainsDraft || [], target.getAttribute("data-domain"), policy);
      render();
    },
    "remove-domain": function (target) {
      App.domainsDraft = domainPolicy.without(App.domainsDraft || [], target.getAttribute("data-domain"));
      render();
    },
    "save-domains": saveDomains,
    "save-ttl": saveTtl,
    "invalidate-domain": invalidateDomain,
    retry: function (target) {
      loadSection(target.getAttribute("data-section") || "metricas");
    },
    "open-demo": function () {
      Sereno.browser.openPage("app/demo-store/store.html");
    }
  };

  function init() {
    if (App.initialized) {
      return;
    }
    root = document.getElementById("app");
    if (!root) {
      return;
    }
    App.initialized = true;
    Sereno.ui.delegateActions(root, ACTIONS);
    store.subscribe(function (state) {
      App.state = state;
      loadAll();
      render();
    });
    store.ready().then(function (state) {
      App.state = state;
      loadAll();
      render();
    });
  }

  Sereno.ui.onReady(init);
})();

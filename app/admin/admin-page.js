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

  var NOTICE_MS = 2600;

  var App = {
    initialized: false,
    state: null,
    metrics: Sereno.seed.metrics || {},
    section: "metricas",
    showAllQueries: false,
    addPolicy: domainPolicy.DEFAULT_POLICY,
    domainsDraft: null,
    domainsBanner: false,
    cacheNotice: ""
  };

  var root = null;

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    root.innerHTML = Sereno.adminViews.page(App, App.state);
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
    }
    return domain;
  }

  function today() {
    return time.isoDay(new Date());
  }

  /* ---------------- actions ---------------- */

  function addDomain() {
    var domain = readDomain("newDomain");
    if (!domain) {
      return;
    }
    var outcome = domainPolicy.addRow(App.domainsDraft || [], domain, App.addPolicy, today());
    if (outcome.added) {
      App.domainsDraft = outcome.rows;
      admin.addDomain(store, outcome.added);
    }
    App.addPolicy = domainPolicy.DEFAULT_POLICY;
    render();
  }

  function saveDomains() {
    var next = domainPolicy.stampChanges(App.domainsDraft || [], (App.state && App.state.domains) || [], today());
    App.domainsDraft = next;
    showDomainsBanner(true);
    admin.saveDomains(store, next);
    render();
  }

  function invalidateDomain() {
    var domain = readDomain("invalidateDomain");
    if (!domain) {
      return;
    }
    admin.invalidateDomain(store, domain, new Date());
    showCacheNotice(domain + " se invalidó. La siguiente consulta irá al modelo.");
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
    "save-ttl": function () {
      admin.saveTtl(store, readValue("ttlPhishingDays"), readValue("ttlLegitHours"));
      showCacheNotice("TTL guardado.");
      render();
    },
    "invalidate-domain": invalidateDomain,
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
      render();
    });
    store.ready().then(function (state) {
      App.state = state;
      App.domainsDraft = (state.domains || []).map(domainPolicy.toRow);
      render();
    });
  }

  Sereno.ui.onReady(init);
})();

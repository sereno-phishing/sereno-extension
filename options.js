/* Sereno options (admin) controller: sidebar shell plus the metrics, per-domain
   policy and cache sections. Classic script. No inline handlers: every
   interaction flows through delegated data-action attributes (MV3 CSP). */

(function () {
  "use strict";

  var Store = window.SerenoStore;
  var DATA = window.SERENO_DATA || {};
  var METRICS = DATA.metrics || {};

  var NOTICE_MS = 2600;
  var QUERY_PREVIEW = 3;
  var ICON_DIR = "assets/icons/";

  var STATUS_META = {
    seguro: { label: "Seguro", icon: "admin-pill-ok.svg", pill: "pill-seguro" },
    advertencia: { label: "Advertencia", icon: "admin-pill-warn.svg", pill: "pill-advertencia" },
    bloqueo: { label: "Bloqueado", icon: "admin-pill-bad.svg", pill: "pill-bloqueo" }
  };

  /* Mini-strip heights (px) for the four stat cards live in METRICS.sparklines. */
  var SPARKLINES = METRICS.sparklines || {};

  function iconImg(cls, file) {
    return '<img class="' + cls + '" src="' + ICON_DIR + file + '" alt="">';
  }

  var App = {
    initialized: false,
    state: null,
    section: "metricas",
    showAllQueries: false,
    addPolicy: "advertencia",
    domainsDraft: null,
    domainsBanner: false,
    cacheNotice: ""
  };

  var root = null;
  var domainsTimer = null;
  var cacheTimer = null;

  /* ---------------- helpers ---------------- */

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad2(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function formatInt(number) {
    return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function statusMeta(status) {
    return STATUS_META[status] || STATUS_META.seguro;
  }

  function todayIso() {
    var now = new Date();
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  }

  /* Renders YYYY-MM-DD without timezone drift (plain Date parsing would shift
     the day in negative offsets). Falls back to the store formatter. */
  function formatDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (match) {
      return match[3] + "/" + match[2] + "/" + match[1];
    }
    return Store.formatDateShort(value);
  }

  /* Invalidation dates may be seeded as ISO (2026-09-22) or written as display
     dates (formatDateShort output). Render both as DD/MM/YYYY. */
  function formatInvalidationDate(value) {
    var text = String(value || "");
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      return text;
    }
    return formatDay(text);
  }

  function readValue(selector) {
    var input = root ? root.querySelector(selector) : null;
    return input ? input.value : "";
  }

  function publicDomain(row) {
    return { domain: row.domain, policy: row.policy, updatedAt: row.updatedAt };
  }

  function openDemoPage() {
    try {
      if (typeof chrome !== "undefined" && chrome.tabs && typeof chrome.tabs.create === "function") {
        chrome.tabs.create({ url: chrome.runtime.getURL("demo/tienda.html") });
      }
    } catch (error) {
      /* prototype: the demo page may not exist yet, never block the UI */
    }
  }

  function clearNotice(kind) {
    if (kind === "domains" && domainsTimer) {
      clearTimeout(domainsTimer);
      domainsTimer = null;
    }
    if (kind === "cache" && cacheTimer) {
      clearTimeout(cacheTimer);
      cacheTimer = null;
    }
  }

  /* ---------------- sidebar ---------------- */

  function navHtml() {
    var items = [
      { id: "metricas", label: "Métricas" },
      { id: "dominios", label: "Política por dominio" },
      { id: "cache", label: "Caché" }
    ];
    var html = '<nav class="sidebar-nav" aria-label="Secciones">';
    items.forEach(function (item) {
      var active = App.section === item.id;
      html +=
        '<button type="button" class="nav-item' + (active ? " is-active" : "") + '" data-action="nav" ' +
        'data-section="' + item.id + '" aria-current="' + (active ? "page" : "false") + '">' +
        esc(item.label) + "</button>";
    });
    return html + "</nav>";
  }

  function sidebarHtml(state) {
    var session = state.session;
    var roleLabel = session.role === "administrador" ? "Administrador" : session.role;
    return (
      '<aside class="sidebar">' +
      '<div class="sidebar-brand"><img class="sidebar-logo" src="assets/logo.png" alt="Sereno">' +
      '<span class="sidebar-name">Sereno</span></div>' +
      navHtml() +
      '<div class="sidebar-foot">' +
      '<button type="button" class="sidebar-demo" data-action="open-demo">Abrir tienda de demo</button>' +
      '<div class="sidebar-user"><span class="sidebar-avatar" aria-hidden="true"></span>' +
      '<div><div class="sidebar-username">' + esc(session.username) + "</div>" +
      '<div class="sidebar-role">' + esc(roleLabel) + "</div></div></div>" +
      "</div></aside>"
    );
  }

  /* ---------------- métricas ---------------- */

  function statCard(label, value, sub, subClass, tone, bars) {
    var barsHtml = bars
      .map(function (height) {
        return '<span class="stat-bar" style="height:' + height + 'px"></span>';
      })
      .join("");
    return (
      '<div class="stat-card">' +
      '<div class="stat-label">' + esc(label) + "</div>" +
      '<div class="stat-value">' + esc(value) + "</div>" +
      '<div class="stat-sub ' + subClass + '">' + esc(sub) + "</div>" +
      '<div class="stat-bars stat-bars-' + tone + '">' + barsHtml + "</div>" +
      "</div>"
    );
  }

  function legendHtml() {
    return (
      '<div class="legend">' +
      '<span class="legend-item">' + iconImg("dot", "admin-dot-green.svg") + "Seguro</span>" +
      '<span class="legend-item">' + iconImg("dot", "admin-dot-amber.svg") + "Advertencia</span>" +
      '<span class="legend-item">' + iconImg("dot", "admin-dot-red.svg") + "Bloqueado</span>" +
      "</div>"
    );
  }

  function chartCard() {
    var bars = (METRICS.hourly || [])
      .map(function (hour) {
        return '<span class="chart-bar level-' + esc(hour.level) + '" style="height:' + hour.height + 'px"></span>';
      })
      .join("");
    return (
      '<div class="card chart-card">' +
      '<div class="card-head"><div class="card-title">Consultas por hora</div>' + legendHtml() + "</div>" +
      '<div class="chart">' + bars + "</div></div>"
    );
  }

  function queriesCard() {
    var queries = METRICS.queries || [];
    var visible = App.showAllQueries ? queries : queries.slice(0, QUERY_PREVIEW);
    var rows = visible
      .map(function (row) {
        var meta = statusMeta(row.status);
        return (
          "<tr><td>" + esc(row.domain) + "</td><td>" + esc(row.stamp) + "</td><td>" + esc(row.source) +
          "</td><td>" + esc(row.latencyMs + " ms") + '</td><td><span class="pill ' + meta.pill + '">' +
          iconImg("pill-img", meta.icon) + esc(meta.label) + "</span></td></tr>"
        );
      })
      .join("");
    return (
      '<div class="card table-card">' +
      '<div class="card-head"><div class="card-title">Últimas consultas (hasta 50)</div>' +
      '<button type="button" class="table-link" data-action="toggle-queries">' +
      (App.showAllQueries ? "Ver menos" : "Ver todas") + "</button></div>" +
      '<table class="data-table t-queries"><thead><tr><th>Dominio</th><th>Fecha y hora</th><th>Fuente</th>' +
      "<th>Latencia</th><th>Resultado</th></tr></thead><tbody>" + rows + "</tbody></table></div>"
    );
  }

  function sectionMetricas() {
    var m = METRICS;
    var html = '<section class="section section-metricas">';
    html +=
      '<div class="section-head"><h1 class="section-title">Métricas de operación</h1>' +
      '<span class="section-ago">Últimas 24 horas</span></div>';
    html += '<div class="stat-grid">';
    html += statCard("URLs analizadas", formatInt(m.analyzed), "+" + m.deltaPct + "% frente a ayer", "stat-sub-muted", "indigo", SPARKLINES.indigo || []);
    html += statCard("% phishing", m.phishingPct + " %", m.phishingCount + " URLs detectadas", "stat-sub-muted", "red", SPARKLINES.red || []);
    html += statCard("Latencia media", m.latencyMs + " ms", "Meta ≤ " + m.latencyTargetMs + " ms", "stat-sub-muted", "amber", SPARKLINES.amber || []);
    html += statCard("Tasa de aciertos del caché", m.cacheHitPct + " %", "HIT frente a MISS", "stat-sub-muted", "green", SPARKLINES.green || []);
    html += "</div>";
    html += chartCard();
    html += queriesCard();
    return html + "</section>";
  }

  /* ---------------- política por dominio ---------------- */

  function addPolicyChip(policy) {
    var active = App.addPolicy === policy;
    var isBlock = policy === "bloqueo";
    var cls = active ? (isBlock ? " is-red" : " is-amber") : "";
    var label = isBlock ? "Bloqueo duro" : "Advertencia";
    var dot = active ? iconImg("dot", isBlock ? "admin-dot-red.svg" : "admin-dot-amber.svg") : "";
    return (
      '<button type="button" class="policy-chip' + cls + '" data-action="pick-add-policy" ' +
      'data-policy="' + policy + '" aria-pressed="' + active + '">' + dot + esc(label) + "</button>"
    );
  }

  function addDomainCard() {
    return (
      '<div class="card add-domain">' +
      '<input class="input add-domain-input" type="text" name="newDomain" placeholder="ejemplo-dominio.com" ' +
      'autocomplete="off" spellcheck="false">' +
      '<div class="policy-picker">' + addPolicyChip("advertencia") + addPolicyChip("bloqueo") + "</div>" +
      '<button type="button" class="btn btn-ghost" data-action="add-domain">Agregar</button>' +
      "</div>"
    );
  }

  function rowPolicyChip(domain, policy, active) {
    var isBlock = policy === "bloqueo";
    var cls = active ? (isBlock ? " is-red" : " is-amber") : "";
    var label = isBlock ? "Bloqueo duro" : "Advertencia";
    var dot = active ? iconImg("dot", isBlock ? "admin-dot-red.svg" : "admin-dot-amber.svg") : "";
    return (
      '<button type="button" class="policy-chip' + cls + '" data-action="pick-row-policy" ' +
      'data-domain="' + esc(domain) + '" data-policy="' + policy + '" aria-pressed="' + active + '">' +
      dot + esc(label) + "</button>"
    );
  }

  function domainsTable(draft) {
    var rows = draft
      .map(function (row) {
        return (
          "<tr><td>" + esc(row.domain) + '</td><td><span class="policy-pair">' +
          rowPolicyChip(row.domain, "advertencia", row.policy === "advertencia") +
          rowPolicyChip(row.domain, "bloqueo", row.policy === "bloqueo") + "</span></td><td>" +
          esc(formatDay(row.updatedAt)) + "</td><td>" +
          '<button type="button" class="remove-link" data-action="remove-domain" data-domain="' +
          esc(row.domain) + '">Quitar</button></td></tr>'
        );
      })
      .join("");
    return (
      '<div class="card table-card"><table class="data-table t-policy"><thead><tr>' +
      "<th>Dominio</th><th>Política</th><th>Modificado</th><th></th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>"
    );
  }

  function sectionDominios() {
    var draft = App.domainsDraft || [];
    var html = '<section class="section section-dominios">';
    html +=
      '<div class="section-head"><div><h1 class="section-title">Política por dominio</h1>' +
      '<p class="section-sub">Elige qué pasa cuando un dominio de la lista se detecta como phishing.</p></div></div>';
    if (App.domainsBanner) {
      html += successBanner("Cambios guardados.");
    }
    html += addDomainCard();
    html += domainsTable(draft);
    html += '<div class="note-bar">Si un dominio no está en la lista, se aplica Advertencia.</div>';
    html +=
      '<div class="save-row"><span class="save-note">Queda registrado y aplica desde la siguiente consulta.</span>' +
      '<button type="button" class="btn btn-primary" data-action="save-domains">Guardar cambios</button></div>';
    return html + "</section>";
  }

  /* ---------------- caché ---------------- */

  function successBanner(text) {
    return (
      '<div class="banner-success section-banner" role="status">' + iconImg("banner-img", "admin-banner-ok.svg") +
      "<span>" + esc(text) + "</span></div>"
    );
  }

  function ttlCard(cache) {
    return (
      '<div class="card cache-card">' +
      '<div class="card-title">Duración de los veredictos (TTL)</div>' +
      '<p class="card-sub">Aplica a las nuevas escrituras, sin redesplegar.</p>' +
      '<div class="ttl-field"><span class="ttl-label">TTL veredictos phishing</span>' +
      '<input class="input ttl-input" type="number" min="1" name="ttlPhishingDays" value="' +
      esc(cache.ttlPhishingDays) + '"><span class="ttl-unit">días</span></div>' +
      '<div class="ttl-field"><span class="ttl-label">TTL veredictos legítimos</span>' +
      '<input class="input ttl-input" type="number" min="1" name="ttlLegitHours" value="' +
      esc(cache.ttlLegitHours) + '"><span class="ttl-unit">horas</span></div>' +
      '<button type="button" class="btn btn-ghost" data-action="save-ttl">Guardar TTL</button>' +
      "</div>"
    );
  }

  function invalidateCard() {
    return (
      '<div class="card cache-card">' +
      '<div class="card-title">Invalidar un dominio</div>' +
      '<p class="card-sub">Úsalo cuando un dominio legítimo fue clasificado por error.</p>' +
      '<div class="invalidate-row">' +
      '<input class="input" type="text" name="invalidateDomain" placeholder="dominio.com" ' +
      'autocomplete="off" spellcheck="false">' +
      '<button type="button" class="btn btn-danger" data-action="invalidate-domain">Invalidar</button>' +
      "</div></div>"
    );
  }

  function invalidationsCard(cache) {
    var rows = (cache.invalidations || [])
      .map(function (item) {
        return (
          "<tr><td>" + esc(item.domain) + "</td><td>" + esc(item.status) + "</td><td>" +
          esc(formatInvalidationDate(item.date)) + "</td><td></td></tr>"
        );
      })
      .join("");
    return (
      '<div class="card table-card"><div class="card-head">' +
      '<div class="card-title">Invalidaciones recientes</div></div>' +
      '<table class="data-table t-cache"><thead><tr><th>Dominio</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>"
    );
  }

  function sectionCache(state) {
    var cache = state.cache || {};
    var html = '<section class="section section-cache">';
    html +=
      '<div class="section-head"><div><h1 class="section-title">Caché de veredictos</h1>' +
      '<p class="section-sub">Controla cuánto dura cada veredicto guardado y fuerza una nueva evaluación de un dominio.</p>' +
      "</div></div>";
    if (App.cacheNotice) {
      html += successBanner(App.cacheNotice);
    }
    html += '<div class="cache-grid">' + ttlCard(cache) + invalidateCard() + "</div>";
    html += invalidationsCard(cache);
    return html + "</section>";
  }

  /* ---------------- actions ---------------- */

  function addDomain() {
    var input = root.querySelector('[name="newDomain"]');
    var value = input ? input.value.trim().toLowerCase() : "";
    if (!value) {
      if (input) {
        input.classList.add("has-error");
      }
      return;
    }
    var draft = (App.domainsDraft || []).slice();
    var exists = draft.some(function (row) {
      return row.domain === value;
    });
    if (!exists) {
      var added = { domain: value, policy: App.addPolicy, updatedAt: todayIso() };
      draft.unshift(added);
      App.domainsDraft = draft;
      /* Persist only the new row; pending edits in the draft wait for Guardar. */
      Store.update(function (current) {
        var stored = (current.domains || []).filter(function (row) {
          return row.domain !== added.domain;
        });
        return { domains: [publicDomain(added)].concat(stored) };
      });
    }
    App.addPolicy = "advertencia";
    render();
  }

  function setDraftPolicy(domain, policy) {
    if (policy !== "advertencia" && policy !== "bloqueo") {
      return;
    }
    App.domainsDraft = (App.domainsDraft || []).map(function (row) {
      return row.domain === domain ? { domain: row.domain, policy: policy, updatedAt: row.updatedAt } : row;
    });
    render();
  }

  function removeDraftDomain(domain) {
    App.domainsDraft = (App.domainsDraft || []).filter(function (row) {
      return row.domain !== domain;
    });
    render();
  }

  function saveDomains() {
    var today = todayIso();
    var stored = (App.state && App.state.domains) || [];
    var next = (App.domainsDraft || []).map(function (row) {
      var previous = null;
      stored.forEach(function (item) {
        if (item.domain === row.domain) {
          previous = item;
        }
      });
      var updatedAt = row.updatedAt;
      if (!previous || previous.policy !== row.policy) {
        updatedAt = today;
      }
      return { domain: row.domain, policy: row.policy, updatedAt: updatedAt };
    });
    App.domainsDraft = next;
    App.domainsBanner = true;
    clearNotice("domains");
    domainsTimer = setTimeout(function () {
      App.domainsBanner = false;
      render();
    }, NOTICE_MS);
    Store.set({ domains: next });
    render();
  }

  function showCacheNotice(text) {
    App.cacheNotice = text;
    clearNotice("cache");
    cacheTimer = setTimeout(function () {
      App.cacheNotice = "";
      render();
    }, NOTICE_MS);
  }

  function saveTtl() {
    var days = parseInt(readValue('[name="ttlPhishingDays"]'), 10);
    var hours = parseInt(readValue('[name="ttlLegitHours"]'), 10);
    var cache = Object.assign({}, App.state.cache);
    if (days > 0) {
      cache.ttlPhishingDays = days;
    }
    if (hours > 0) {
      cache.ttlLegitHours = hours;
    }
    Store.set({ cache: cache });
    showCacheNotice("TTL guardado.");
    render();
  }

  function invalidateDomain() {
    var input = root.querySelector('[name="invalidateDomain"]');
    var domain = input ? input.value.trim().toLowerCase() : "";
    if (!domain) {
      if (input) {
        input.classList.add("has-error");
      }
      return;
    }
    var record = {
      domain: domain,
      status: "Se reevaluará en la próxima consulta",
      date: Store.formatDateShort(new Date().toISOString())
    };
    var cache = Object.assign({}, App.state.cache);
    cache.invalidations = [record].concat(cache.invalidations || []);
    Store.set({ cache: cache });
    showCacheNotice(domain + " se invalidó. La siguiente consulta irá al modelo.");
    render();
  }

  function handleAction(action, target) {
    switch (action) {
      case "nav":
        App.section = target.getAttribute("data-section") || "metricas";
        render();
        break;
      case "toggle-queries":
        App.showAllQueries = !App.showAllQueries;
        render();
        break;
      case "pick-add-policy":
        App.addPolicy = target.getAttribute("data-policy") === "bloqueo" ? "bloqueo" : "advertencia";
        render();
        break;
      case "add-domain":
        addDomain();
        break;
      case "pick-row-policy":
        setDraftPolicy(target.getAttribute("data-domain"), target.getAttribute("data-policy"));
        break;
      case "remove-domain":
        removeDraftDomain(target.getAttribute("data-domain"));
        break;
      case "save-domains":
        saveDomains();
        break;
      case "save-ttl":
        saveTtl();
        break;
      case "invalidate-domain":
        invalidateDomain();
        break;
      case "open-demo":
        openDemoPage();
        break;
      default:
        break;
    }
  }

  function sectionHtml(state) {
    switch (App.section) {
      case "dominios":
        return sectionDominios();
      case "cache":
        return sectionCache(state);
      default:
        return sectionMetricas();
    }
  }

  function isAdmin(state) {
    return !!(state.session && state.session.role === "administrador");
  }

  /* Shown instead of the panel when nobody, or a non-admin user, is signed in. */
  function accessGateHtml() {
    return (
      '<main class="access-gate"><div class="card access-gate-card">' +
      '<img class="access-gate-logo" src="assets/logo.png" alt="Sereno">' +
      '<h1 class="access-gate-title">Panel de administración</h1>' +
      '<p class="access-gate-text">Inicia sesión con una cuenta de administrador desde el popup de Sereno ' +
      "para ver este panel.</p></div></main>"
    );
  }

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    if (!isAdmin(App.state)) {
      root.innerHTML = accessGateHtml();
      return;
    }
    root.innerHTML = sidebarHtml(App.state) + '<main class="options-content">' + sectionHtml(App.state) + "</main>";
  }

  function onClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") {
      return;
    }
    var actionTarget = target.closest("[data-action]");
    if (!actionTarget || !root.contains(actionTarget)) {
      return;
    }
    handleAction(actionTarget.getAttribute("data-action"), actionTarget);
  }

  function init() {
    if (App.initialized) {
      return;
    }
    root = document.getElementById("app");
    if (!root) {
      return;
    }
    App.initialized = true;
    root.addEventListener("click", onClick);
    Store.subscribe(function (state) {
      App.state = state;
      render();
    });
    Store.ready().then(function (state) {
      App.state = state;
      App.domainsDraft = (state.domains || []).map(publicDomain);
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

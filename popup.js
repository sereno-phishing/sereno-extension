/* Sereno popup controller: state machine + renderer for every popup view.
   Classic script. No inline handlers: all interaction flows through delegated
   data-action attributes. */

(function () {
  "use strict";

  var Store = window.SerenoStore;
  var DATA = window.SERENO_DATA || { susQuestions: [] };
  var QUESTIONS = DATA.susQuestions || [];

  var UI_KEY = "sereno.ui.v1";
  var MODEL_VERSION = "1.2";
  var MODEL_UPDATED_VERSION = "1.3";

  var STATUS_META = {
    seguro: {
      label: "Seguro",
      title: "Sitio seguro",
      glyph: "✓",
      solid: "chip-seguro",
      soft: "chip-soft-seguro",
      icon: "status-icon-seguro",
      card: "status-card-seguro",
      band: "seguro"
    },
    advertencia: {
      label: "Advertencia",
      title: "Advertencia",
      glyph: "!",
      solid: "chip-advertencia",
      soft: "chip-soft-advertencia",
      icon: "status-icon-advertencia",
      card: "status-card-advertencia",
      band: "advertencia"
    },
    bloqueo: {
      label: "Bloqueado",
      title: "Sitio bloqueado",
      glyph: "✕",
      solid: "chip-bloqueado",
      soft: "chip-soft-bloqueado",
      icon: "status-icon-bloqueo",
      card: "status-card-bloqueo",
      band: "bloqueo"
    },
    pendiente: {
      label: "Evaluando…",
      title: "Evaluación pendiente",
      glyph: "◔",
      solid: "chip-soft-neutral",
      soft: "chip-soft-neutral",
      icon: "status-icon-pendiente",
      card: "status-card-pendiente",
      band: "pendiente"
    }
  };

  var FILTERS = [
    { id: "todas", label: "Todas" },
    { id: "seguro", label: "Seguro", dot: "dot-green" },
    { id: "advertencia", label: "Advertencia", dot: "dot-amber" },
    { id: "bloqueo", label: "Bloqueado", dot: "dot-red" }
  ];

  var App = {
    initialized: false,
    state: null,
    view: "home",
    onboardingStep: 1,
    tab: "home",
    historyFilter: "todas",
    detailId: null,
    surveyIndex: 0,
    surveyAnswers: [],
    menuOpen: false,
    confirmOpen: false,
    loginError: false,
    registerError: false
  };

  var root = null;

  /* ---------------- small helpers ---------------- */

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusMeta(status) {
    return STATUS_META[status] || STATUS_META.pendiente;
  }

  function riskLabel(entry) {
    if (entry.status === "bloqueo") {
      return "Alto";
    }
    if (entry.status === "advertencia") {
      return entry.score >= 0.85 ? "Alto" : "Medio";
    }
    if (entry.status === "seguro") {
      return "Bajo";
    }
    return "—";
  }

  function sourceLabel(source) {
    return source === "cache" ? "Caché" : "Modelo";
  }

  function computeSusResult(answers) {
    var total = 0;
    for (var index = 0; index < QUESTIONS.length; index += 1) {
      var value = Number(answers[index]) || 0;
      total += index % 2 === 0 ? value - 1 : 5 - value;
    }
    var score = Math.round(total * 2.5);
    var band = "A mejorar";
    var bandClass = "sus-band-mejorar";
    if (score >= 85) {
      band = "Excelente";
      bandClass = "sus-band-excelente";
    } else if (score >= 70) {
      band = "Bueno";
      bandClass = "sus-band-bueno";
    } else if (score >= 50) {
      band = "Aceptable";
      bandClass = "sus-band-aceptable";
    }
    return { score: score, band: band, bandClass: bandClass };
  }

  function openGeneratedPage(file) {
    try {
      if (typeof chrome !== "undefined" && chrome.tabs && typeof chrome.tabs.create === "function") {
        var url = chrome.runtime && typeof chrome.runtime.getURL === "function" ? chrome.runtime.getURL(file) : file;
        chrome.tabs.create({ url: url });
        return;
      }
      if (typeof window !== "undefined" && typeof window.open === "function") {
        window.open(file, "_blank");
      }
    } catch (error) {
      /* prototype: never block the UI on a navigation error */
    }
  }

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ tab: App.tab }));
    } catch (error) {
      /* private mode: UI persistence is best effort */
    }
  }

  function restoreUi() {
    try {
      var raw = localStorage.getItem(UI_KEY);
      if (!raw) {
        return;
      }
      var ui = JSON.parse(raw);
      if (ui && (ui.tab === "home" || ui.tab === "history")) {
        App.tab = ui.tab;
      }
    } catch (error) {
      /* ignore malformed UI state */
    }
  }

  /* ---------------- header / footer ---------------- */

  function headerHtml(state) {
    var left;
    if (App.view === "detail") {
      left = '<button type="button" class="back-link" data-action="back-history">← Historial</button>';
    } else {
      left =
        '<div class="brand">' +
        '<img class="brand-logo" src="assets/logo.png" alt="Sereno">' +
        '<span class="brand-name">Sereno</span>' +
        "</div>";
    }
    return '<header class="app-header">' + left + '<div class="header-slot">' + headerSlotHtml(state) + "</div></header>";
  }

  function headerSlotHtml(state) {
    if (App.view === "onboarding") {
      return '<span class="step-counter">' + App.onboardingStep + " de 3</span>";
    }
    var session = state.session;
    if (!session) {
      return "";
    }
    if (session.role === "administrador") {
      return '<button type="button" class="admin-pill" data-action="toggle-menu" aria-haspopup="menu">Admin</button>';
    }
    return (
      '<button type="button" class="avatar" data-action="toggle-menu" aria-haspopup="menu" ' +
      'aria-label="Cuenta de ' + esc(session.username) + '">' + esc(Store.initials(session.username)) + "</button>"
    );
  }

  function footerHtml(state) {
    var updated = !!state.modelNoticeDismissed;
    return (
      '<footer class="app-footer">' +
      '<button type="button" class="footer-link" data-action="open-privacy">Política de privacidad</button>' +
      '<span class="footer-model' + (updated ? " is-updated" : "") + '">Modelo v' +
      (updated ? MODEL_UPDATED_VERSION : MODEL_VERSION) +
      "</span></footer>"
    );
  }

  /* ---------------- shared view pieces ---------------- */

  function tabsHtml() {
    var homeActive = App.view === "home";
    return (
      '<div class="tabs" role="tablist">' +
      '<button type="button" role="tab" data-action="tab" data-tab="home" class="' + (homeActive ? "active" : "") +
      '" aria-selected="' + homeActive + '">Inicio</button>' +
      '<button type="button" role="tab" data-action="tab" data-tab="history" class="' + (!homeActive ? "active" : "") +
      '" aria-selected="' + !homeActive + '">Historial</button>' +
      "</div>"
    );
  }

  function protectionCardHtml() {
    return (
      '<div class="protection-card">' +
      '<span class="protection-icon">✓</span>' +
      '<div><div class="protection-title">Protección activa</div>' +
      '<div class="protection-sub">Modo por defecto: Advertencia</div></div>' +
      "</div>"
    );
  }

  function siteCardHtml(state) {
    var site = state.currentSite || {};
    var meta = statusMeta(site.status);
    return (
      '<div class="card site-card">' +
      '<div><div class="site-label">Este sitio</div>' +
      '<div class="site-domain">' + esc(site.domain) + "</div></div>" +
      '<span class="chip ' + meta.soft + '">' + meta.glyph + " " + esc(meta.label) + "</span>" +
      "</div>"
    );
  }

  function iconLegendHtml() {
    return (
      '<div class="icon-legend"><div class="legend-title">Estados del ícono</div>' +
      '<div class="legend-items">' +
      '<span class="legend-item"><i class="dot dot-green"></i>Activa</span>' +
      '<span class="legend-item"><i class="dot dot-grey"></i>Inactiva</span>' +
      '<span class="legend-item"><i class="dot dot-amber"></i>Sin conexión</span>' +
      "</div></div>"
    );
  }

  function adminCardHtml() {
    return (
      '<div class="card admin-card"><div class="admin-title">Administración</div>' +
      '<p class="admin-text">Métricas, política por dominio y caché.</p>' +
      '<button type="button" class="btn btn-primary btn-block" data-action="open-admin">Abrir panel de administración</button>' +
      "</div>"
    );
  }

  function noticeHtml(state) {
    if (!state.session || state.modelNoticeDismissed) {
      return "";
    }
    return (
      '<button type="button" class="notice-card" data-action="dismiss-notice">' +
      '<span class="notice-icon">✓</span>' +
      '<span class="notice-body">' +
      '<span class="notice-title">Modelo actualizado a v' + MODEL_UPDATED_VERSION + "</span>" +
      '<span class="notice-text">Se actualizó en el servidor. No tienes que reinstalar nada.</span>' +
      "</span></button>"
    );
  }

  function bannerError(message) {
    return '<div class="banner-error" role="alert"><span class="banner-icon">✕</span><span>' + esc(message) + "</span></div>";
  }

  function fieldHtml(label, name, type, placeholder, hasError, help) {
    var html =
      '<label class="field"><span class="field-label">' + esc(label) + "</span>" +
      '<input class="input' + (hasError ? " has-error" : "") + '" type="' + type + '" name="' + name + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") +
      ' autocomplete="off" spellcheck="false">';
    if (help) {
      html += '<span class="field-help field-help-error">' + esc(help) + "</span>";
    }
    return html + "</label>";
  }

  function checkItem(text) {
    return '<div class="check-item"><span class="check-icon">✓</span><span>' + esc(text) + "</span></div>";
  }

  function legendRow(chipClass, chipText, text) {
    return (
      '<div class="legend-row"><span class="chip ' + chipClass + '">' + chipText + "</span>" +
      '<span class="legend-row-text">' + esc(text) + "</span></div>"
    );
  }

  function dotsHtml(step) {
    var html = '<div class="dots">';
    for (var index = 1; index <= 3; index += 1) {
      html += '<span class="dot-step' + (index === step ? " active" : "") + '"></span>';
    }
    return html + "</div>";
  }

  /* ---------------- views ---------------- */

  function viewOnboarding() {
    var step = App.onboardingStep;
    var html = '<section class="view view-onboarding">';
    if (step === 1) {
      html +=
        '<div class="illustration"><span class="illust-logo-wrap">' +
        '<img class="illust-logo" src="assets/logo.png" alt="">' +
        '<span class="illust-badge">✓</span></span></div>';
      html += '<h1 class="onboarding-title">Revisamos el sitio antes de que pagues</h1>';
      html +=
        '<p class="onboarding-body">Si el enlace es seguro, sigues navegando. Si parece phishing, ' +
        "te avisamos antes de que ingreses tus datos.</p>";
    } else if (step === 2) {
      html += '<div class="illustration"><img class="illust-logo" src="assets/logo.png" alt=""></div>';
      html += '<h1 class="onboarding-title">Qué permiso necesitamos</h1>';
      html += '<p class="onboarding-body">Solo leemos la dirección de la pestaña actual para evaluarla.</p>';
      html +=
        '<div class="check-list">' +
        checkItem("No leemos el contenido de la página") +
        checkItem("No guardamos la dirección completa") +
        checkItem("Funciona sin crear una cuenta") +
        "</div>";
    } else {
      html +=
        '<div class="illustration"><div class="illust-circles">' +
        '<span class="illust-circle illust-circle-green">✓</span>' +
        '<span class="illust-circle illust-circle-amber">!</span>' +
        '<span class="illust-circle illust-circle-red">✕</span>' +
        "</div></div>";
      html += '<h1 class="onboarding-title">Cómo leer una alerta</h1>';
      html +=
        '<div class="legend-rows">' +
        legendRow("chip-soft-seguro", "✓ Seguro", "Nada se interrumpe") +
        legendRow("chip-soft-advertencia", "! Advertencia", "Puedes volver o continuar") +
        legendRow("chip-soft-bloqueado", "✕ Bloqueado", "No se puede seguir") +
        "</div>";
      html +=
        '<p class="onboarding-body onboarding-note">La protección queda activa en modo Advertencia. ' +
        "No tienes que configurar nada.</p>";
    }
    html += '<div class="onboarding-controls">' + dotsHtml(step) + '<div class="onboarding-buttons">';
    if (step > 1) {
      html += '<button type="button" class="btn btn-ghost" data-action="onboarding-back">Atrás</button>';
    }
    if (step < 3) {
      html += '<button type="button" class="btn btn-primary" data-action="onboarding-next">Siguiente</button>';
    } else {
      html += '<button type="button" class="btn btn-primary" data-action="onboarding-start">Empezar</button>';
    }
    html += "</div></div></section>";
    return html;
  }

  function viewHome(state) {
    var session = state.session;
    var parts = [];
    if (session && session.role !== "administrador") {
      parts.push(tabsHtml());
    }
    parts.push(protectionCardHtml());
    if (!session) {
      parts.push(siteCardHtml(state));
      parts.push(iconLegendHtml());
      parts.push('<div class="flex-spacer"></div>');
      parts.push('<p class="muted-line">Inicia sesión para guardar tu historial.</p>');
      parts.push(
        '<div class="actions-stack">' +
        '<button type="button" class="btn btn-primary btn-block" data-action="go-login">Iniciar sesión</button>' +
        '<button type="button" class="btn btn-ghost btn-block" data-action="go-register">Crear cuenta</button>' +
        "</div>"
      );
    } else if (session.role === "administrador") {
      parts.push(adminCardHtml());
      parts.push(noticeHtml(state));
    } else {
      parts.push(siteCardHtml(state));
      parts.push(iconLegendHtml());
      parts.push(noticeHtml(state));
    }
    return '<section class="view view-home">' + parts.join("") + "</section>";
  }

  function viewLogin() {
    var html = '<section class="view view-form">';
    html += '<h1 class="view-title">Inicia sesión</h1>';
    html += '<p class="view-sub">Accede a tu historial de sitios evaluados.</p>';
    html += '<form class="form" data-form="login" novalidate>';
    if (App.loginError) {
      html += bannerError("Usuario o contraseña incorrectos.");
    }
    html += fieldHtml("Usuario", "username", "text", "nombre de usuario", false, "");
    html += fieldHtml("Contraseña", "password", "password", "", App.loginError, "");
    html += '<button type="submit" class="btn btn-primary btn-block">Iniciar sesión</button>';
    html += "</form>";
    html +=
      '<p class="center-note">¿No tienes cuenta? ' +
      '<button type="button" class="link-btn" data-action="go-register">Crea una</button></p>';
    html += "</section>";
    return html;
  }

  function viewRegister() {
    var html = '<section class="view view-form">';
    html += '<h1 class="view-title">Crea tu cuenta</h1>';
    html += '<p class="view-sub">Guarda tu historial y úsalo en otros dispositivos.</p>';
    html += '<form class="form" data-form="register" novalidate>';
    if (App.registerError) {
      html += bannerError("El usuario ya existe.");
    }
    html += fieldHtml(
      "Usuario",
      "username",
      "text",
      "nombre de usuario",
      App.registerError,
      App.registerError ? "Elige otro nombre de usuario." : ""
    );
    html += fieldHtml("Contraseña", "password", "password", "", false, "");
    html += '<p class="field-help">Se guarda cifrada. No pedimos tu correo.</p>';
    html += '<button type="submit" class="btn btn-primary btn-block">Crear cuenta</button>';
    html += "</form>";
    html +=
      '<p class="center-note">¿Ya tienes cuenta? ' +
      '<button type="button" class="link-btn" data-action="go-login">Inicia sesión</button></p>';
    html += "</section>";
    return html;
  }

  function filtersHtml() {
    var html = '<div class="filter-chips">';
    FILTERS.forEach(function (filter) {
      var active = App.historyFilter === filter.id;
      var dot = filter.dot ? '<i class="dot ' + filter.dot + '"></i>' : "";
      html +=
        '<button type="button" class="filter-chip' + (active ? " is-active" : "") + '" data-action="filter" ' +
        'data-filter="' + filter.id + '" aria-pressed="' + active + '">' + dot + esc(filter.label) + "</button>";
    });
    return html + "</div>";
  }

  function historyItemHtml(entry) {
    var meta = statusMeta(entry.status);
    var full = Store.formatDate(entry.ts);
    var chunks = full.split(" ");
    var dateText = chunks[0] + (chunks[1] ? " · " + chunks[1] : "");
    return (
      '<button type="button" class="history-item" data-action="open-detail" data-id="' + esc(entry.id) + '">' +
      "<span>" +
      '<span class="history-domain">' + esc(entry.domain) + "</span>" +
      '<span class="history-date">' + esc(dateText) + "</span>" +
      "</span>" +
      '<span class="history-right"><span class="chip ' + meta.solid + '">' + meta.glyph + " " + esc(meta.label) +
      '</span><span class="chevron">›</span></span>' +
      "</button>"
    );
  }

  function viewHistory(state) {
    var session = state.session;
    var entries = session && state.history[session.username] ? state.history[session.username] : [];
    var filtered =
      App.historyFilter === "todas"
        ? entries
        : entries.filter(function (entry) {
            return entry.status === App.historyFilter;
          });
    var html = '<section class="view view-history">';
    html += tabsHtml();
    html += filtersHtml();
    if (!entries.length) {
      html +=
        '<div class="empty-state"><span class="empty-circle"></span>' +
        '<p class="empty-title">Todavía no hay sitios evaluados en esta cuenta.</p>' +
        '<p class="empty-sub">Cuando navegues, los sitios aparecerán aquí.</p></div>';
    } else if (!filtered.length) {
      html += '<p class="filter-empty">No hay sitios con este resultado.</p>';
    } else {
      html += '<div class="history-list">' + filtered.map(historyItemHtml).join("") + "</div>";
    }
    if (entries.length) {
      html +=
        '<button type="button" class="btn btn-ghost history-delete" data-action="confirm-clear">' +
        "Borrar historial</button>";
    }
    html += "</section>";
    return html;
  }

  function findEntry(state, id) {
    var session = state.session;
    if (!session || !state.history[session.username]) {
      return null;
    }
    var list = state.history[session.username];
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].id === id) {
        return list[index];
      }
    }
    return null;
  }

  function detailRow(label, valueHtml) {
    return '<div class="detail-row"><span class="detail-label">' + esc(label) + "</span>" + valueHtml + "</div>";
  }

  function viewDetail(state) {
    var entry = findEntry(state, App.detailId);
    if (!entry) {
      return '<section class="view view-detail"><p class="filter-empty">No hay sitios con este resultado.</p></section>';
    }
    var meta = statusMeta(entry.status);
    var score = Number(entry.score) || 0;
    var percent = Math.max(0, Math.min(100, Math.round(score * 100)));
    return (
      '<section class="view view-detail">' +
      '<div class="status-card ' + meta.card + '">' +
      '<span class="status-icon ' + meta.icon + '">' + meta.glyph + "</span>" +
      '<div><div class="status-title status-title-' + meta.band + '">' + esc(meta.title) + "</div>" +
      '<div class="status-domain">' + esc(entry.domain) + "</div></div></div>" +
      '<div class="detail-rows">' +
      detailRow("Nivel de riesgo", '<span class="detail-value">' + riskLabel(entry) + "</span>") +
      detailRow(
        "Score del modelo",
        '<span class="detail-score"><span class="score-track"><span class="score-fill score-fill-' + meta.band +
          '" style="width:' + percent + '%"></span></span>' +
          '<span class="detail-value">' + score.toFixed(2) + "</span></span>"
      ) +
      detailRow("Fecha de clasificación", '<span class="detail-value">' + esc(Store.formatDate(entry.ts)) + "</span>") +
      detailRow("Fuente del veredicto", '<span class="hu-chip">' + sourceLabel(entry.source) + "</span>") +
      "</div>" +
      '<div class="detail-note">Solo se guarda el dominio, no la dirección completa.</div>' +
      "</section>"
    );
  }

  function viewSurvey() {
    var index = App.surveyIndex;
    var total = QUESTIONS.length;
    var selected = App.surveyAnswers[index];
    var progress = Math.round(((index + 1) / total) * 100);
    var html = '<section class="view view-survey">';
    html += '<div class="survey-meta">Pregunta ' + (index + 1) + " de " + total + "</div>";
    html += '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>';
    html += '<h2 class="survey-question">' + esc(QUESTIONS[index]) + "</h2>";
    html += '<div class="scale">';
    for (var value = 1; value <= 5; value += 1) {
      html +=
        '<button type="button" class="scale-btn' + (selected === value ? " is-selected" : "") +
        '" data-action="answer" data-value="' + value + '" aria-pressed="' + (selected === value) + '">' + value + "</button>";
    }
    html += "</div>";
    html += '<div class="scale-labels"><span>Totalmente en desacuerdo</span><span>Totalmente de acuerdo</span></div>';
    html += '<div class="flex-spacer"></div>';
    html += '<p class="survey-note">Tus respuestas son anónimas.</p>';
    html += '<div class="survey-actions">';
    html +=
      '<button type="button" class="btn btn-ghost" data-action="survey-back"' + (index === 0 ? " disabled" : "") +
      ">Atrás</button>";
    html +=
      '<button type="button" class="btn btn-primary" data-action="survey-next"' + (selected ? "" : " disabled") + ">" +
      (index === total - 1 ? "Finalizar" : "Siguiente") + "</button>";
    html += "</div></section>";
    return html;
  }

  function viewSurveyResult() {
    var result = computeSusResult(App.surveyAnswers);
    return (
      '<section class="view view-survey-result"><div class="sus-result">' +
      '<div class="sus-score">' + result.score + " / 100</div>" +
      '<div class="sus-band ' + result.bandClass + '">' + result.band + "</div>" +
      '<p class="sus-note">Tus respuestas son anónimas.</p>' +
      '<button type="button" class="btn btn-primary sus-close" data-action="survey-close">Cerrar</button>' +
      "</div></section>"
    );
  }

  function menuHtml(state) {
    if (!App.menuOpen || !state.session) {
      return "";
    }
    var session = state.session;
    var html =
      '<div class="menu-overlay" data-action="close-menu">' +
      '<div class="account-menu" role="menu" aria-label="Cuenta">';
    html +=
      '<div class="menu-head"><div class="menu-user">' + esc(session.username) + "</div>" +
      '<div class="menu-role">Rol: ' + esc(session.role) + "</div></div>";
    if (session.role === "administrador") {
      html +=
        '<button type="button" class="menu-item" role="menuitem" data-action="open-admin">Panel de administración</button>';
    }
    html += '<div class="menu-sep"></div>';
    html += '<button type="button" class="menu-item" role="menuitem" data-action="open-survey">Encuesta de opinión</button>';
    html += '<div class="menu-sep"></div>';
    html += '<button type="button" class="menu-item menu-item-danger" role="menuitem" data-action="logout">Cerrar sesión</button>';
    html += "</div></div>";
    return html;
  }

  function confirmHtml() {
    if (!App.confirmOpen) {
      return "";
    }
    return (
      '<div class="confirm-overlay"><div class="confirm-card" role="dialog" aria-modal="true" ' +
      'aria-label="Borrar historial">' +
      '<h2 class="confirm-title">¿Borrar tu historial?</h2>' +
      '<p class="confirm-text">Se elimina de tu cuenta. No se puede deshacer.</p>' +
      '<div class="confirm-actions">' +
      '<button type="button" class="btn btn-ghost" data-action="cancel-clear">No</button>' +
      '<button type="button" class="btn btn-danger" data-action="confirm-clear-yes">Sí, borrar</button>' +
      "</div></div></div>"
    );
  }

  function contentHtml(state) {
    switch (App.view) {
      case "onboarding":
        return viewOnboarding();
      case "login":
        return viewLogin();
      case "register":
        return viewRegister();
      case "history":
        return viewHistory(state);
      case "detail":
        return viewDetail(state);
      case "survey":
        return viewSurvey();
      case "surveyResult":
        return viewSurveyResult();
      default:
        return viewHome(state);
    }
  }

  function render() {
    if (!App.initialized || !root || !App.state) {
      return;
    }
    root.innerHTML =
      headerHtml(App.state) +
      '<main class="app-content" id="content">' + contentHtml(App.state) + "</main>" +
      footerHtml(App.state) +
      menuHtml(App.state) +
      confirmHtml();
  }

  /* ---------------- survey flow ---------------- */

  function resetSurveyDraftFromState() {
    var stored = App.state && App.state.survey && App.state.survey.answers ? App.state.survey.answers : [];
    var answers = [];
    for (var index = 0; index < QUESTIONS.length; index += 1) {
      answers.push(stored[index] || null);
    }
    App.surveyAnswers = answers;
    App.surveyIndex = 0;
  }

  function persistSurvey(completed) {
    var answers = App.surveyAnswers.slice();
    Store.update(function (current) {
      var survey = Object.assign({}, current.survey, { answers: answers });
      if (completed) {
        survey.completedAt = Store.todayStamp();
      }
      return { survey: survey };
    });
  }

  function selectAnswer(value) {
    if (!value) {
      return;
    }
    App.surveyAnswers[App.surveyIndex] = value;
    persistSurvey(false);
    render();
  }

  function nextSurveyQuestion() {
    if (!App.surveyAnswers[App.surveyIndex]) {
      return;
    }
    if (App.surveyIndex >= QUESTIONS.length - 1) {
      App.view = "surveyResult";
      persistSurvey(true);
      render();
      return;
    }
    App.surveyIndex += 1;
    render();
  }

  /* ---------------- actions ---------------- */

  function handleAction(action, target) {
    switch (action) {
      case "onboarding-next":
        App.onboardingStep = Math.min(3, App.onboardingStep + 1);
        render();
        break;
      case "onboarding-back":
        App.onboardingStep = Math.max(1, App.onboardingStep - 1);
        render();
        break;
      case "onboarding-start":
        Store.set({ onboardingDone: true }).then(function () {
          App.view = "home";
          App.tab = "home";
          saveUi();
          render();
        });
        break;
      case "go-login":
        App.loginError = false;
        App.view = "login";
        render();
        break;
      case "go-register":
        App.registerError = false;
        App.view = "register";
        render();
        break;
      case "toggle-menu":
        App.menuOpen = !App.menuOpen;
        render();
        break;
      case "close-menu":
        if (App.menuOpen) {
          App.menuOpen = false;
          render();
        }
        break;
      case "logout":
        Store.logout().then(function () {
          App.menuOpen = false;
          App.view = "home";
          App.tab = "home";
          App.historyFilter = "todas";
          App.detailId = null;
          saveUi();
          render();
        });
        break;
      case "open-admin":
        App.menuOpen = false;
        render();
        openGeneratedPage("options.html");
        break;
      case "open-privacy":
        openGeneratedPage("privacidad.html");
        break;
      case "open-survey":
        App.menuOpen = false;
        resetSurveyDraftFromState();
        App.view = "survey";
        render();
        break;
      case "answer":
        selectAnswer(Number(target.getAttribute("data-value")));
        break;
      case "survey-back":
        if (App.surveyIndex > 0) {
          App.surveyIndex -= 1;
          render();
        }
        break;
      case "survey-next":
        nextSurveyQuestion();
        break;
      case "survey-close":
        App.view = "home";
        App.tab = "home";
        render();
        break;
      case "tab": {
        var tab = target.getAttribute("data-tab") === "history" ? "history" : "home";
        App.tab = tab;
        App.view = tab;
        saveUi();
        render();
        break;
      }
      case "filter":
        App.historyFilter = target.getAttribute("data-filter") || "todas";
        render();
        break;
      case "open-detail":
        App.detailId = target.getAttribute("data-id");
        App.view = "detail";
        render();
        break;
      case "back-history":
        App.view = "history";
        App.tab = "history";
        render();
        break;
      case "confirm-clear":
        App.confirmOpen = true;
        render();
        break;
      case "cancel-clear":
        App.confirmOpen = false;
        render();
        break;
      case "confirm-clear-yes":
        clearHistoryNow();
        break;
      case "dismiss-notice":
        Store.set({ modelNoticeDismissed: true });
        break;
      default:
        break;
    }
  }

  function clearHistoryNow() {
    var session = App.state.session;
    if (!session) {
      return;
    }
    Store.clearHistory(session.username).then(function () {
      App.confirmOpen = false;
      App.view = "history";
      App.tab = "history";
      render();
    });
  }

  function onSubmit(event) {
    var form = event.target;
    var kind = form && form.getAttribute ? form.getAttribute("data-form") : null;
    if (!kind) {
      return;
    }
    event.preventDefault();
    var usernameInput = form.querySelector('[name="username"]');
    var passwordInput = form.querySelector('[name="password"]');
    var username = usernameInput ? usernameInput.value.trim() : "";
    var password = passwordInput ? passwordInput.value : "";
    if (kind === "login") {
      submitLogin(username, password);
    } else if (kind === "register") {
      submitRegister(username, password);
    }
  }

  function submitLogin(username, password) {
    Store.login(username, password).then(function (result) {
      if (!result.ok) {
        App.loginError = true;
        render();
        return;
      }
      App.loginError = false;
      App.registerError = false;
      App.view = "home";
      App.tab = "home";
      App.historyFilter = "todas";
      saveUi();
      render();
    });
  }

  function submitRegister(username, password) {
    Store.register(username, password).then(function (result) {
      if (!result.ok) {
        App.registerError = true;
        render();
        return;
      }
      App.registerError = false;
      App.loginError = false;
      App.view = "home";
      App.tab = "home";
      App.historyFilter = "todas";
      App.surveyIndex = 0;
      App.surveyAnswers = [];
      saveUi();
      render();
    });
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

  function onKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    if (App.confirmOpen) {
      App.confirmOpen = false;
      render();
    } else if (App.menuOpen) {
      App.menuOpen = false;
      render();
    }
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (App.initialized) {
      return;
    }
    root = document.getElementById("app");
    if (!root) {
      return;
    }
    App.initialized = true;
    restoreUi();
    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeydown);
    Store.subscribe(function (state) {
      App.state = state;
      render();
    });
    Store.ready().then(function (state) {
      App.state = state;
      var stored = state.survey && state.survey.answers ? state.survey.answers : [];
      var answers = [];
      for (var index = 0; index < QUESTIONS.length; index += 1) {
        answers.push(stored[index] || null);
      }
      App.surveyAnswers = answers;
      if (!state.onboardingDone) {
        App.view = "onboarding";
        App.onboardingStep = 1;
      } else {
        var tabAvailable = state.session && state.session.role !== "administrador" && App.tab === "history";
        App.view = tabAvailable ? "history" : "home";
        App.tab = App.view;
      }
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

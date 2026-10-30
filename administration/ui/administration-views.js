/* Administration · presentational views of the admin panel sections:
   operation metrics, per-domain policy and verdict cache. Classic script that
   registers Sereno.administrationUi. Plain data in, HTML out. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var time = Sereno.time;
  var verdict = Sereno.verdict;
  var verdictUi = Sereno.verdictUi;
  var domainPolicy = Sereno.domainPolicy;
  var translations = {
    "Cargando...": "Loading...", "Reintentar": "Retry", "URLs analizadas": "URLs analyzed",
    "% phishing": "% phishing", "frente a ayer": "vs. yesterday", "URLs detectadas": "URLs detected",
    "Latencia media": "Average latency", "Meta ≤ ": "Target ≤ ", "Tasa de aciertos del caché": "Cache hit rate", "HIT frente a MISS": "HIT vs. MISS",
    "Seguro": "Safe", "Advertencia": "Warning", "Bloqueado": "Blocked", "Evaluando…": "Evaluating…", "Bloqueo duro": "Hard block",
    "Consultas por hora": "Queries per hour", "Gráfico de barras de consultas por hora en las últimas 24 horas, por resultado": "Bar chart of hourly queries in the last 24 hours by result",
    "Últimas consultas (hasta 50)": "Latest queries (up to 50)", "Ver menos": "Show less", "Ver todas": "Show all", "Últimas consultas": "Latest queries",
    "Dominio": "Domain", "Fecha y hora": "Date and time", "Fuente": "Source", "Latencia": "Latency", "Resultado": "Result",
    "Métricas de operación": "Operation metrics", "Todavía no hay métricas para mostrar.": "There are no metrics to show yet.", "Últimas 24 horas": "Last 24 hours",
    "Datos simulados para la demostración; no son métricas personales ni del backend.": "Simulated data for demonstration; these are not personal or backend metrics.",
    "Dominio a agregar": "Domain to add", "Política del dominio nuevo": "New domain policy", "Agregar": "Add",
    "Todavía no hay dominios en la lista.": "There are no domains in the list yet.", "Dominios con política propia": "Domains with custom policy",
    "Política": "Policy", "Modificado": "Modified", "Acciones": "Actions", "Política de ": "Policy for ", " para ": " for ", "Quitar ": "Remove ", "Quitar": "Remove",
    "Política por dominio": "Domain policy", "Elige qué pasa cuando un dominio de la lista se detecta como phishing.": "Choose what happens when a listed domain is detected as phishing.",
    "Cambios guardados.": "Changes saved.", "Si un dominio no está en la lista, se aplica ": "If a domain is not listed, the policy is ",
    "Queda registrado y aplica desde la siguiente consulta.": "Saved and applied from the next query.", "Guardar cambios": "Save changes",
    "Duración de los veredictos (TTL)": "Verdict duration (TTL)", "Aplica a las nuevas escrituras, sin redesplegar.": "Applies to new writes without redeployment.",
    "TTL veredictos phishing": "Phishing verdict TTL", "días": "days", "TTL veredictos legítimos": "Legitimate verdict TTL", "horas": "hours", "Guardar TTL": "Save TTL",
    "Invalidar un dominio": "Invalidate a domain", "Úsalo cuando un dominio legítimo fue clasificado por error.": "Use this when a legitimate domain was classified incorrectly.",
    "Dominio a invalidar": "Domain to invalidate", "Invalidar": "Invalidate", "No hay invalidaciones recientes.": "There are no recent invalidations.",
    "Invalidaciones recientes": "Recent invalidations", "Estado": "Status", "Fecha": "Date", "Caché de veredictos": "Verdict cache",
    "Datos y acciones simulados para la demostración; todavía no modifican el backend.": "Simulated data and actions for demonstration; they do not modify the backend yet.",
    "TTL guardado.": "TTL saved.", " se invalidó. La siguiente consulta irá al modelo.": " was invalidated. The next query will go to the model.",
    "El servidor tardó demasiado en responder. Inténtalo de nuevo.": "The server took too long to respond. Please try again.",
    "Sin conexión. Revisa tu red e inténtalo de nuevo.": "Offline. Check your network and try again.",
    "El servidor no está disponible. Inténtalo más tarde.": "The server is unavailable. Please try again later.",
    "El caché de veredictos no está disponible. Inténtalo más tarde.": "The verdict cache is unavailable. Please try again later.",
    "Solo una cuenta de administrador puede gestionar las políticas por dominio.": "Only an administrator account can manage domain policies.",
    "Esta cuenta ya participó en la encuesta. Gracias por tu opinión.": "This account has already completed the survey. Thank you for your feedback."
  };
  var entries = {};
  Object.keys(translations).forEach(function (spanish) { entries["admin.text." + spanish] = { es: spanish, en: translations[spanish] }; });
  if (Sereno.i18n) Sereno.i18n.register(entries);
  function tr(text) { return Sereno.i18n && entries["admin.text." + text] ? Sereno.i18n.t("admin.text." + text) : text; }
  function tableCard(options) {
    return ui.tableCard(options).replace('<span class="sr-only">Acciones</span>', '<span class="sr-only">' + ui.esc(tr("Acciones")) + '</span>');
  }
  function errorMessage(code, fallback) {
    var messages = { timeout: "El servidor tardó demasiado en responder. Inténtalo de nuevo.", offline: "Sin conexión. Revisa tu red e inténtalo de nuevo.", server: "El servidor no está disponible. Inténtalo más tarde.", cache_down: "El caché de veredictos no está disponible. Inténtalo más tarde.", forbidden: "Solo una cuenta de administrador puede gestionar las políticas por dominio.", already_submitted: "Esta cuenta ya participó en la encuesta. Gracias por tu opinión." };
    return code && messages[code] && fallback === messages[code] ? tr(messages[code]) : fallback;
  }

  /* Rows of the latest-queries table shown before "Ver todas". */
  var QUERY_PREVIEW = 3;

  /* 1284 -> "1 284" */
  function formatInt(number) {
    return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function sectionHead(title, subHtml) {
    return '<div class="section-head">' + '<h1 class="section-title">' + ui.esc(title) + "</h1>" + subHtml + "</div>";
  }

  /* Heading with a description paragraph below the title. */
  function describedHead(title, description) {
    return (
      '<div class="section-head"><div><h1 class="section-title">' + ui.esc(title) + "</h1>" +
      '<p class="section-sub">' + ui.esc(description) + "</p></div></div>"
    );
  }

  function cardHead(title, extraHtml) {
    return '<div class="card-head"><div class="card-title">' + ui.esc(title) + "</div>" + (extraHtml || "") + "</div>";
  }

  function errorBanner(text) {
    return ui.banner({ tone: "error", cls: "section-banner", role: "alert", iconHtml: ui.icon("bad", "banner-img"), text: text });
  }

  /* ---------------- loading skeletons ---------------- */

  /* Placeholders reuse the containers of the loaded section (stat-grid, chart-card,
     table-card...) so nothing moves when the data arrives. */
  function skel(shape, cls) {
    return ui.skeleton({ shape: shape, cls: cls });
  }

  function skelRows(count) {
    return new Array(count + 1).join('<div class="skeleton-table-row">' + skel("line", "skeleton-cell") + skel("line", "skeleton-cell skeleton-cell-short") + "</div>");
  }

  function skelTable(withHead, rows) {
    return '<div class="card table-card">' + (withHead ? '<div class="card-head">' + skel("line", "skeleton-title") + "</div>" : "") + skelRows(rows) + "</div>";
  }

  function skelStatCard() {
    return (
      '<div class="stat-card">' + skel("line", "skeleton-stat-label") + skel("line", "skeleton-stat-value") +
      skel("line", "skeleton-stat-sub") + skel("rect", "skeleton-stat-bars") + "</div>"
    );
  }

  function skelCacheCard() {
    return '<div class="card cache-card">' + skel("line", "skeleton-title") + skel("line", "skeleton-sub") + skel("rect", "skeleton-field") + skel("rect", "skeleton-button") + "</div>";
  }

  function loadingBody(id) {
    if (id === "dominios") {
      return (
        '<div class="card add-domain">' + skel("rect", "skeleton-field") + skel("pill", "skeleton-choices") + skel("rect", "skeleton-button") + "</div>" +
        skelTable(false, 4) + skel("rect", "skeleton-note") +
        '<div class="save-row">' + skel("line", "skeleton-save-note") + skel("rect", "skeleton-button") + "</div>"
      );
    }
    if (id === "cache") {
      return '<div class="cache-grid">' + skelCacheCard() + skelCacheCard() + "</div>" + skelTable(true, 3);
    }
    return (
      skel("rect", "skeleton-note") +
      '<div class="stat-grid">' + new Array(5).join(skelStatCard()) + "</div>" +
      '<div class="card chart-card"><div class="card-head">' + skel("line", "skeleton-title") + skel("line", "skeleton-legend") + "</div>" + skel("rect", "skeleton-chart") + "</div>" +
      skelTable(true, 3)
    );
  }

  function loadingSection(model) {
    var head = model.id === "metricas"
      ? sectionHead(model.title, skel("line", "section-ago skeleton-ago"))
      : '<div class="section-head"><div><h1 class="section-title">' + ui.esc(model.title) + "</h1>" + skel("line", "skeleton-sub") + "</div></div>";
    return (
      '<section class="section section-' + ui.esc(model.id) + '">' + head +
      '<p class="sr-only" role="status">' + ui.esc(tr("Cargando...")) + "</p>" + loadingBody(model.id) + "</section>"
    );
  }

  /* A section that has no data to show: "loading" (skeleton), "error" (message + retry)
     or "empty". model: { id, title, state, message } */
  function statusSection(model) {
    var body;
    if (model.state === "loading") {
      return loadingSection(model);
    } else if (model.state === "error") {
      body =
        '<div class="card panel-status">' + errorBanner(model.message) +
        '<button type="button" class="btn btn-ghost" data-action="retry" data-section="' + ui.esc(model.id) + '">' + ui.esc(tr("Reintentar")) + '</button></div>';
    } else {
      body = '<div class="card panel-status">' + ui.esc(model.message) + "</div>";
    }
    return '<section class="section section-' + ui.esc(model.id) + '">' + sectionHead(model.title, "") + body + "</section>";
  }

  function successBanner(text) {
    return ui.banner({ tone: "success", cls: "section-banner", role: "status", iconHtml: ui.icon("admin-banner-ok", "banner-img"), text: text });
  }

  /* ---------------- metrics ---------------- */

  function statCard(card) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-label">' + ui.esc(card.label) + "</div>" +
      '<div class="stat-value">' + ui.esc(card.value) + "</div>" +
      '<div class="stat-sub stat-sub-muted">' + ui.esc(card.sub) + "</div>" +
      '<div class="stat-bars stat-bars-' + card.tone + '" aria-hidden="true">' +
      (card.bars || []).map(function (height) {
        return '<span class="stat-bar" style="height:' + height + 'px"></span>';
      }).join("") +
      "</div></div>"
    );
  }

  function statCards(metrics) {
    var bars = metrics.sparklines || {};
    return [
      { label: tr("URLs analizadas"), value: formatInt(metrics.analyzed), sub: "+" + metrics.deltaPct + "% " + tr("frente a ayer"), tone: "indigo" },
      { label: tr("% phishing"), value: metrics.phishingPct + " %", sub: metrics.phishingCount + " " + tr("URLs detectadas"), tone: "red" },
      { label: tr("Latencia media"), value: metrics.latencyMs + " ms", sub: tr("Meta ≤ ") + metrics.latencyTargetMs + " ms", tone: "amber" },
      { label: tr("Tasa de aciertos del caché"), value: metrics.cacheHitPct + " %", sub: tr("HIT frente a MISS"), tone: "green" }
    ].map(function (card) {
      return statCard(Object.assign(card, { bars: bars[card.tone] }));
    }).join("");
  }

  function chartLegend() {
    return (
      '<div class="legend">' +
      verdict.VERDICTS.map(function (id) {
        var status = verdict.status(id);
        return ui.legendItem(verdictUi.adminDot(status.tone), tr(status.label));
      }).join("") +
      "</div>"
    );
  }

  function chartCard(hourly) {
    return (
      '<div class="card chart-card">' + cardHead(tr("Consultas por hora"), chartLegend()) +
      '<div class="chart" role="img" aria-label="' + ui.esc(tr("Gráfico de barras de consultas por hora en las últimas 24 horas, por resultado")) + '">' +
      (hourly || []).map(function (hour) {
        return '<span class="chart-bar level-' + ui.esc(hour.level) + '" style="height:' + hour.height + 'px"></span>';
      }).join("") +
      "</div></div>"
    );
  }

  function queriesCard(queries, showAll) {
    var visible = showAll ? queries : queries.slice(0, QUERY_PREVIEW);
    return tableCard({
      headHtml: cardHead(
        tr("Últimas consultas (hasta 50)"),
        '<button type="button" class="table-link" data-action="toggle-queries" aria-expanded="' + !!showAll + '">' + ui.esc(tr(showAll ? "Ver menos" : "Ver todas")) + "</button>"
      ),
      tableCls: "t-queries",
      caption: tr("Últimas consultas"),
      columns: ["Dominio", "Fecha y hora", "Fuente", "Latencia", "Resultado"].map(tr),
      rows: visible.map(function (row) {
        var status = verdict.status(row.status);
        var pill = ui.pill("pill-" + status.id, ui.icon("admin-pill-" + status.tone, "pill-img") + ui.esc(tr(status.label)));
        return [ui.esc(row.domain), ui.esc(row.stamp), ui.esc(row.source), ui.esc(row.latencyMs + " ms"), pill];
      })
    });
  }

  /* model: { metrics, showAllQueries } */
  function metricsSection(model) {
    var metrics = model.metrics;
    if (!metrics || typeof metrics.analyzed !== "number") {
      return statusSection({ id: "metricas", title: tr("Métricas de operación"), state: "empty", message: tr("Todavía no hay métricas para mostrar.") });
    }
    return (
      '<section class="section section-metricas">' +
      sectionHead(tr("Métricas de operación"), '<span class="section-ago">' + ui.esc(tr("Últimas 24 horas")) + '</span>') +
      '<div class="note-bar">' + ui.esc(tr("Datos simulados para la demostración; no son métricas personales ni del backend.")) + '</div>' +
      '<div class="stat-grid">' + statCards(metrics) + "</div>" +
      chartCard(metrics.hourly) +
      queriesCard(metrics.queries || [], model.showAllQueries) +
      "</section>"
    );
  }

  /* ---------------- per-domain policy ---------------- */

  /* options: { policy, active, action, domain?, ariaLabel? } */
  function policyChip(options) {
    var policy = domainPolicy.POLICIES[options.policy];
    var colour = verdictUi.toneColor(policy.tone);
    return ui.chip({
      cls: ui.classes(["policy-chip", options.active && (colour === "red" ? "is-red" : "is-amber")]),
      action: options.action,
      data: (options.domain !== undefined ? [["domain", options.domain]] : []).concat([["policy", policy.id]]),
      pressed: options.active,
      lead: options.active ? verdictUi.adminDot(policy.tone) : "",
      label: tr(policy.label),
      ariaLabel: options.ariaLabel
    });
  }

  function addDomainCard(addPolicy) {
    return (
      '<div class="card add-domain">' +
      ui.input({ cls: "input add-domain-input", type: "text", name: "newDomain", placeholder: "ejemplo-dominio.com", ariaLabel: tr("Dominio a agregar"), assist: true }) +
      '<div class="policy-picker" role="group" aria-label="' + ui.esc(tr("Política del dominio nuevo")) + '">' +
      domainPolicy.POLICY_IDS.map(function (id) {
        return policyChip({ policy: id, active: addPolicy === id, action: "pick-add-policy" });
      }).join("") +
      "</div>" +
      ui.button({ label: tr("Agregar"), variant: "ghost", action: "add-domain" }) +
      "</div>"
    );
  }

  function domainsTable(rows) {
    if (!rows.length) {
      return '<div class="card panel-status domains-empty">' + ui.esc(tr("Todavía no hay dominios en la lista.")) + '</div>';
    }
    return tableCard({
      tableCls: "t-policy",
      caption: tr("Dominios con política propia"),
      columns: ["Dominio", "Política", "Modificado", ""].map(tr),
      rows: rows.map(function (row) {
        return [
          ui.esc(row.domain),
          '<span class="policy-pair" role="group" aria-label="' + ui.esc(tr("Política de ") + row.domain) + '">' +
            domainPolicy.POLICY_IDS.map(function (id) {
              return policyChip({
                policy: id,
                active: row.policy === id,
                action: "pick-row-policy",
                domain: row.domain,
                ariaLabel: tr(domainPolicy.POLICIES[id].label) + tr(" para ") + row.domain
              });
            }).join("") +
            "</span>",
          ui.esc(time.formatDay(row.updatedAt)),
          '<button type="button" class="remove-link" data-action="remove-domain" data-domain="' + ui.esc(row.domain) + '" aria-label="' + ui.esc(tr("Quitar ") + row.domain) + '">' + ui.esc(tr("Quitar")) + '</button>'
        ];
      })
    });
  }

  /* model: { rows, addPolicy, saved, error? } */
  function domainsSection(model) {
    return (
      '<section class="section section-dominios">' +
      describedHead(tr("Política por dominio"), tr("Elige qué pasa cuando un dominio de la lista se detecta como phishing.")) +
      (model.saved ? successBanner(tr("Cambios guardados.")) : "") +
      (model.error ? errorBanner(errorMessage(model.errorCode, model.error)) : "") +
      addDomainCard(model.addPolicy) +
      domainsTable(model.rows) +
      '<div class="note-bar">' + ui.esc(tr("Si un dominio no está en la lista, se aplica ") + tr(domainPolicy.POLICIES[domainPolicy.DEFAULT_POLICY].label)) + ".</div>" +
      '<div class="save-row"><span class="save-note">' + ui.esc(tr("Queda registrado y aplica desde la siguiente consulta.")) + '</span>' +
      ui.button({ label: tr("Guardar cambios"), variant: "primary", action: "save-domains" }) + "</div>" +
      "</section>"
    );
  }

  /* ---------------- verdict cache ---------------- */

  function ttlField(label, name, value, unit, id) {
    return (
      '<div class="ttl-field"><label class="ttl-label" for="' + id + '">' + ui.esc(label) + "</label>" +
      ui.input({ cls: "input ttl-input", type: "number", min: 1, name: name, value: value, id: id, describedBy: id + "-unit" }) +
      '<span class="ttl-unit" id="' + id + '-unit">' + ui.esc(unit) + "</span></div>"
    );
  }

  function cacheCard(title, sub, bodyHtml) {
    return (
      '<div class="card cache-card"><div class="card-title">' + ui.esc(title) + "</div>" +
      '<p class="card-sub">' + ui.esc(sub) + "</p>" + bodyHtml + "</div>"
    );
  }

  function ttlCard(cache) {
    return cacheCard(
      tr("Duración de los veredictos (TTL)"),
      tr("Aplica a las nuevas escrituras, sin redesplegar."),
      ttlField(tr("TTL veredictos phishing"), "ttlPhishingDays", cache.ttlPhishingDays, tr("días"), "ttl-phishing") +
        ttlField(tr("TTL veredictos legítimos"), "ttlLegitHours", cache.ttlLegitHours, tr("horas"), "ttl-legit") +
        ui.button({ label: tr("Guardar TTL"), variant: "ghost", action: "save-ttl" })
    );
  }

  function invalidateCard() {
    return cacheCard(
      tr("Invalidar un dominio"),
      tr("Úsalo cuando un dominio legítimo fue clasificado por error."),
      '<div class="invalidate-row">' +
        ui.input({ cls: "input", type: "text", name: "invalidateDomain", placeholder: "dominio.com", ariaLabel: tr("Dominio a invalidar"), assist: true }) +
        ui.button({ label: tr("Invalidar"), variant: "danger", action: "invalidate-domain" }) +
        "</div>"
    );
  }

  function invalidationsCard(cache) {
    if (!(cache.invalidations || []).length) {
      return '<div class="card panel-status">' + ui.esc(tr("No hay invalidaciones recientes.")) + '</div>';
    }
    return tableCard({
      headHtml: cardHead(tr("Invalidaciones recientes")),
      tableCls: "t-cache",
      caption: tr("Invalidaciones recientes"),
      columns: ["Dominio", "Estado", "Fecha", ""].map(tr),
      rows: (cache.invalidations || []).map(function (item) {
        return [ui.esc(item.domain), ui.esc(item.status), ui.esc(time.formatAnyDay(item.date)), ""];
      })
    });
  }

  /* model: { cache, notice, error? } */
  function cacheSection(model) {
    var cache = model.cache || {};
    return (
      '<section class="section section-cache">' +
      describedHead(tr("Caché de veredictos"), tr("Datos y acciones simulados para la demostración; todavía no modifican el backend.")) +
      (model.notice ? successBanner(typeof model.notice === "object" ? model.notice.domain + tr(" se invalidó. La siguiente consulta irá al modelo.") : tr(model.notice)) : "") +
      (model.error ? errorBanner(errorMessage(model.errorCode, model.error)) : "") +
      '<div class="cache-grid">' + ttlCard(cache) + invalidateCard() + "</div>" +
      invalidationsCard(cache) +
      "</section>"
    );
  }

  Sereno.administrationUi = {
    text: tr,
    errorMessage: errorMessage,
    statusSection: statusSection,
    metricsSection: metricsSection,
    domainsSection: domainsSection,
    cacheSection: cacheSection
  };
})(globalThis.Sereno = globalThis.Sereno || {});

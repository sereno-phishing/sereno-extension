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
      '<div class="stat-bars stat-bars-' + card.tone + '">' +
      (card.bars || []).map(function (height) {
        return '<span class="stat-bar" style="height:' + height + 'px"></span>';
      }).join("") +
      "</div></div>"
    );
  }

  function statCards(metrics) {
    var bars = metrics.sparklines || {};
    return [
      { label: "URLs analizadas", value: formatInt(metrics.analyzed), sub: "+" + metrics.deltaPct + "% frente a ayer", tone: "indigo" },
      { label: "% phishing", value: metrics.phishingPct + " %", sub: metrics.phishingCount + " URLs detectadas", tone: "red" },
      { label: "Latencia media", value: metrics.latencyMs + " ms", sub: "Meta ≤ " + metrics.latencyTargetMs + " ms", tone: "amber" },
      { label: "Tasa de aciertos del caché", value: metrics.cacheHitPct + " %", sub: "HIT frente a MISS", tone: "green" }
    ].map(function (card) {
      return statCard(Object.assign(card, { bars: bars[card.tone] }));
    }).join("");
  }

  function chartLegend() {
    return (
      '<div class="legend">' +
      verdict.VERDICTS.map(function (id) {
        var status = verdict.status(id);
        return ui.legendItem(verdictUi.adminDot(status.tone), status.label);
      }).join("") +
      "</div>"
    );
  }

  function chartCard(hourly) {
    return (
      '<div class="card chart-card">' + cardHead("Consultas por hora", chartLegend()) +
      '<div class="chart">' +
      (hourly || []).map(function (hour) {
        return '<span class="chart-bar level-' + ui.esc(hour.level) + '" style="height:' + hour.height + 'px"></span>';
      }).join("") +
      "</div></div>"
    );
  }

  function queriesCard(queries, showAll) {
    var visible = showAll ? queries : queries.slice(0, QUERY_PREVIEW);
    return ui.tableCard({
      headHtml: cardHead(
        "Últimas consultas (hasta 50)",
        '<button type="button" class="table-link" data-action="toggle-queries">' + (showAll ? "Ver menos" : "Ver todas") + "</button>"
      ),
      tableCls: "t-queries",
      columns: ["Dominio", "Fecha y hora", "Fuente", "Latencia", "Resultado"],
      rows: visible.map(function (row) {
        return [ui.esc(row.domain), ui.esc(row.stamp), ui.esc(row.source), ui.esc(row.latencyMs + " ms"), verdictUi.adminPill(row.status)];
      })
    });
  }

  /* model: { metrics, showAllQueries } */
  function metricsSection(model) {
    var metrics = model.metrics;
    return (
      '<section class="section section-metricas">' +
      sectionHead("Métricas de operación", '<span class="section-ago">Últimas 24 horas</span>') +
      '<div class="stat-grid">' + statCards(metrics) + "</div>" +
      chartCard(metrics.hourly) +
      queriesCard(metrics.queries || [], model.showAllQueries) +
      "</section>"
    );
  }

  /* ---------------- per-domain policy ---------------- */

  /* options: { policy, active, action, domain? } */
  function policyChip(options) {
    var policy = domainPolicy.POLICIES[options.policy];
    var colour = verdictUi.toneColor(policy.tone);
    return ui.chip({
      cls: ui.classes(["policy-chip", options.active && (colour === "red" ? "is-red" : "is-amber")]),
      action: options.action,
      data: (options.domain !== undefined ? [["domain", options.domain]] : []).concat([["policy", policy.id]]),
      pressed: options.active,
      lead: options.active ? verdictUi.adminDot(policy.tone) : "",
      label: policy.label
    });
  }

  function addDomainCard(addPolicy) {
    return (
      '<div class="card add-domain">' +
      ui.input({ cls: "input add-domain-input", type: "text", name: "newDomain", placeholder: "ejemplo-dominio.com", assist: true }) +
      '<div class="policy-picker">' +
      domainPolicy.POLICY_IDS.map(function (id) {
        return policyChip({ policy: id, active: addPolicy === id, action: "pick-add-policy" });
      }).join("") +
      "</div>" +
      ui.button({ label: "Agregar", variant: "ghost", action: "add-domain" }) +
      "</div>"
    );
  }

  function domainsTable(rows) {
    return ui.tableCard({
      tableCls: "t-policy",
      columns: ["Dominio", "Política", "Modificado", ""],
      rows: rows.map(function (row) {
        return [
          ui.esc(row.domain),
          '<span class="policy-pair">' +
            domainPolicy.POLICY_IDS.map(function (id) {
              return policyChip({ policy: id, active: row.policy === id, action: "pick-row-policy", domain: row.domain });
            }).join("") +
            "</span>",
          ui.esc(time.formatDay(row.updatedAt)),
          '<button type="button" class="remove-link" data-action="remove-domain" data-domain="' + ui.esc(row.domain) + '">Quitar</button>'
        ];
      })
    });
  }

  /* model: { rows, addPolicy, saved } */
  function domainsSection(model) {
    return (
      '<section class="section section-dominios">' +
      describedHead("Política por dominio", "Elige qué pasa cuando un dominio de la lista se detecta como phishing.") +
      (model.saved ? successBanner("Cambios guardados.") : "") +
      addDomainCard(model.addPolicy) +
      domainsTable(model.rows) +
      '<div class="note-bar">Si un dominio no está en la lista, se aplica ' + ui.esc(domainPolicy.POLICIES[domainPolicy.DEFAULT_POLICY].label) + ".</div>" +
      '<div class="save-row"><span class="save-note">Queda registrado y aplica desde la siguiente consulta.</span>' +
      ui.button({ label: "Guardar cambios", variant: "primary", action: "save-domains" }) + "</div>" +
      "</section>"
    );
  }

  /* ---------------- verdict cache ---------------- */

  function ttlField(label, name, value, unit) {
    return (
      '<div class="ttl-field"><span class="ttl-label">' + ui.esc(label) + "</span>" +
      ui.input({ cls: "input ttl-input", type: "number", min: 1, name: name, value: value }) +
      '<span class="ttl-unit">' + ui.esc(unit) + "</span></div>"
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
      "Duración de los veredictos (TTL)",
      "Aplica a las nuevas escrituras, sin redesplegar.",
      ttlField("TTL veredictos phishing", "ttlPhishingDays", cache.ttlPhishingDays, "días") +
        ttlField("TTL veredictos legítimos", "ttlLegitHours", cache.ttlLegitHours, "horas") +
        ui.button({ label: "Guardar TTL", variant: "ghost", action: "save-ttl" })
    );
  }

  function invalidateCard() {
    return cacheCard(
      "Invalidar un dominio",
      "Úsalo cuando un dominio legítimo fue clasificado por error.",
      '<div class="invalidate-row">' +
        ui.input({ cls: "input", type: "text", name: "invalidateDomain", placeholder: "dominio.com", assist: true }) +
        ui.button({ label: "Invalidar", variant: "danger", action: "invalidate-domain" }) +
        "</div>"
    );
  }

  function invalidationsCard(cache) {
    return ui.tableCard({
      headHtml: cardHead("Invalidaciones recientes"),
      tableCls: "t-cache",
      columns: ["Dominio", "Estado", "Fecha", ""],
      rows: (cache.invalidations || []).map(function (item) {
        return [ui.esc(item.domain), ui.esc(item.status), ui.esc(time.formatAnyDay(item.date)), ""];
      })
    });
  }

  /* model: { cache, notice } */
  function cacheSection(model) {
    var cache = model.cache || {};
    return (
      '<section class="section section-cache">' +
      describedHead("Caché de veredictos", "Controla cuánto dura cada veredicto guardado y fuerza una nueva evaluación de un dominio.") +
      (model.notice ? successBanner(model.notice) : "") +
      '<div class="cache-grid">' + ttlCard(cache) + invalidateCard() + "</div>" +
      invalidationsCard(cache) +
      "</section>"
    );
  }

  Sereno.administrationUi = {
    metricsSection: metricsSection,
    domainsSection: domainsSection,
    cacheSection: cacheSection
  };
})(globalThis.Sereno = globalThis.Sereno || {});

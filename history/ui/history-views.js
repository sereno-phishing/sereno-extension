/* History · presentational views: filter chips, the history list, the
   verdict detail and the clear-history confirmation. Classic script that
   registers Sereno.historyUi. Plain data in, HTML out. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var time = Sereno.time;
  var verdict = Sereno.verdict;
  var verdictUi = Sereno.verdictUi;
  var history = Sereno.history;

  var FACTS = verdictUi.FACT_LABELS;
  var local = Sereno.popupI18n || { t: function (text) { return text; }, pill: verdictUi.pill };
  var t = local.t;

  function filterChip(filterId, activeFilter) {
    var all = filterId === history.ALL;
    var active = activeFilter === filterId;
    return ui.chip({
      cls: ui.classes(["filter-chip", active && "is-active"]),
      action: "filter",
      data: [["filter", filterId]],
      pressed: active,
      lead: all ? "" : ui.art("dot-" + verdictUi.toneColor(verdict.status(filterId).tone), "8"),
      label: t(all ? "Todas" : verdict.status(filterId).label)
    });
  }

  function filterChips(activeFilter) {
    return (
      '<div class="filter-chips">' +
      history.filterIds().map(function (id) {
        return filterChip(id, activeFilter);
      }).join("") +
      "</div>"
    );
  }

  /* "DD/MM/YYYY · HH:MM" */
  function listDate(ts) {
    var chunks = time.formatDateTime(ts).split(" ");
    return chunks[0] + (chunks[1] ? " · " + chunks[1] : "");
  }

  function historyItem(entry) {
    return (
      '<button type="button" class="history-item" data-action="open-detail" data-id="' + ui.esc(entry.id) + '">' +
      '<span><span class="history-domain">' + ui.esc(entry.domain) + "</span>" +
      '<span class="history-date">' + ui.esc(listDate(entry.ts)) + "</span></span>" +
      '<span class="history-right">' + local.pill(entry.status, "sm") + '<span class="chevron" aria-hidden="true">›</span></span>' +
      "</button>"
    );
  }

  function emptyState() {
    return '<div class="empty-state"><span class="empty-circle"></span>' +
      '<p class="empty-title">' + t("Todavía no hay sitios evaluados en esta cuenta.") + '</p>' +
      '<p class="empty-sub">' + t("Cuando navegues, los sitios aparecerán aquí.") + '</p></div>';
  }
  function noMatch() { return '<p class="filter-empty">' + t("No hay sitios con este resultado.") + '</p>'; }
  /* Placeholder rows shaped like historyItem; the loading text is for assistive technology only. */
  var LOADING_ROWS = 5;
  function loadingRow() {
    return (
      '<div class="history-skeleton-row"><div class="history-skeleton-text">' +
      ui.skeleton({ cls: "history-skeleton-domain" }) + ui.skeleton({ cls: "history-skeleton-date" }) + "</div>" +
      ui.skeleton({ shape: "pill", cls: "history-skeleton-pill" }) + "</div>"
    );
  }
  function loadingState() {
    return (
      '<div class="history-list" role="status"><span class="sr-only">' + t("Cargando tu historial...") + "</span>" +
      new Array(LOADING_ROWS + 1).join(loadingRow()) + "</div>"
    );
  }

  /* Error text from the data port plus the retry action. */
  function errorNotice(message, code) {
    // Only local provider messages are translated; arbitrary port text stays intact.
    var errors = Sereno.providers && Sereno.providers.errors;
    if (errors && errors.CODES.indexOf(code) >= 0 && message === errors.message(code)) message = t(message);
    return (
      ui.banner({ tone: "error", role: "alert", iconHtml: ui.art("bad", "16"), text: message }) +
      ui.button({ label: t("Reintentar"), variant: "ghost", action: "retry-history" })
    );
  }

  /* model: { tabsHtml, entries, filter, loading?, error? }
     loading: the list has not arrived yet; error: Spanish text of the failure. */
  function listView(model) {
    var filtered = history.filter(model.entries, model.filter);
    var body;
    if (model.error) {
      body = errorNotice(model.error, model.errorCode) + (model.entries.length ? '<div class="history-list">' + filtered.map(historyItem).join("") + "</div>" : "");
    } else if (model.loading && !model.entries.length) {
      body = loadingState();
    } else if (!model.entries.length) {
      body = emptyState();
    } else if (!filtered.length) {
      body = noMatch();
    } else {
      body = '<div class="history-list">' + filtered.map(historyItem).join("") + "</div>";
    }
    return (
      '<section class="view view-history"><h1 class="sr-only">' + t("Historial") + '</h1>' + model.tabsHtml +
      '<div class="tab-panel" role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">' +
      filterChips(model.filter) + body +
      '<div class="flex-spacer"></div>' +
      (model.entries.length ? ui.button({ label: t("Borrar historial"), variant: "ghost", cls: "history-delete", action: "confirm-clear" }) : "") +
      "</div></section>"
    );
  }

  function detailRow(label, valueHtml) {
    return '<div class="detail-row"><span class="detail-label">' + ui.esc(label) + "</span>" + valueHtml + "</div>";
  }

  function detailValue(text) {
    return '<span class="detail-value">' + ui.esc(text) + "</span>";
  }

  function detailView(entry) {
    if (!entry) {
      return '<section class="view view-detail"><h1 class="sr-only">' + t("Detalle del sitio") + '</h1>' + noMatch() + "</section>";
    }
    var status = verdict.status(entry.status);
    var score = Number(entry.score) || 0;
    return (
      '<section class="view view-detail"><h1 class="sr-only">' + t("Detalle de ") + ui.esc(entry.domain) + "</h1>" +
      '<div class="status-card status-card-' + status.id + '">' +
      '<div class="status-head">' + verdictUi.badge(entry.status, "32") +
      '<span class="status-title status-title-' + status.id + '">' + ui.esc(t(status.title)) + "</span></div>" +
      '<div class="status-domain">' + ui.esc(entry.domain) + "</div></div>" +
      '<div class="detail-rows">' +
      detailRow(t(FACTS.risk), detailValue(t(verdict.riskLevel(entry)))) +
      detailRow(
        t(FACTS.score),
        '<span class="detail-score"><span class="score-track" aria-hidden="true"><span class="score-fill score-fill-' + status.id +
          '" style="width:' + verdict.scorePercent(score) + '%"></span></span>' + detailValue(score.toFixed(2)) + "</span>"
      ) +
      detailRow(t(FACTS.date), detailValue(time.formatDateTime(entry.ts))) +
      detailRow(t(FACTS.source), '<span class="hu-chip">' + ui.esc(t(verdict.sourceLabel(entry.source))) + "</span>") +
      "</div>" +
      '<div class="flex-spacer"></div>' +
      '<div class="detail-note">' + t("Solo se guarda el dominio, no la dirección completa.") + '</div>' +
      "</section>"
    );
  }

  function clearConfirm() {
    return (
      '<div class="confirm-overlay"><div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">' +
      '<h2 class="confirm-title" id="confirm-title">' + t("¿Borrar tu historial?") + '</h2>' +
      '<p class="confirm-text" id="confirm-text">' + t("Se elimina de tu cuenta. No se puede deshacer.") + '</p>' +
      '<div class="confirm-actions">' +
      ui.button({ label: t("No"), variant: "ghost", action: "cancel-clear" }) +
      ui.button({ label: t("Sí, borrar"), variant: "danger", action: "confirm-clear-yes" }) +
      "</div></div></div>"
    );
  }

  Sereno.historyUi = {
    listView: listView,
    detailView: detailView,
    clearConfirm: clearConfirm
  };
})(globalThis.Sereno = globalThis.Sereno || {});

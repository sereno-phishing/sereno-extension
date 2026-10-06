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

  function filterChip(filterId, activeFilter) {
    var all = filterId === history.ALL;
    var active = activeFilter === filterId;
    return ui.chip({
      cls: ui.classes(["filter-chip", active && "is-active"]),
      action: "filter",
      data: [["filter", filterId]],
      pressed: active,
      lead: all ? "" : ui.art("dot-" + verdictUi.toneColor(verdict.status(filterId).tone), "8"),
      label: all ? "Todas" : verdict.status(filterId).label
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
      '<span class="history-right">' + verdictUi.pill(entry.status, "sm") + '<span class="chevron">›</span></span>' +
      "</button>"
    );
  }

  var EMPTY_STATE =
    '<div class="empty-state"><span class="empty-circle"></span>' +
    '<p class="empty-title">Todavía no hay sitios evaluados en esta cuenta.</p>' +
    '<p class="empty-sub">Cuando navegues, los sitios aparecerán aquí.</p></div>';

  var NO_MATCH = '<p class="filter-empty">No hay sitios con este resultado.</p>';

  /* model: { tabsHtml, entries, filter } */
  function listView(model) {
    var filtered = history.filter(model.entries, model.filter);
    var body;
    if (!model.entries.length) {
      body = EMPTY_STATE;
    } else if (!filtered.length) {
      body = NO_MATCH;
    } else {
      body = '<div class="history-list">' + filtered.map(historyItem).join("") + "</div>";
    }
    return (
      '<section class="view view-history">' + model.tabsHtml + filterChips(model.filter) + body +
      '<div class="flex-spacer"></div>' +
      (model.entries.length ? ui.button({ label: "Borrar historial", variant: "ghost", cls: "history-delete", action: "confirm-clear" }) : "") +
      "</section>"
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
      return '<section class="view view-detail">' + NO_MATCH + "</section>";
    }
    var status = verdict.status(entry.status);
    var score = Number(entry.score) || 0;
    return (
      '<section class="view view-detail">' +
      '<div class="status-card status-card-' + status.id + '">' +
      '<div class="status-head">' + verdictUi.badge(entry.status, "32") +
      '<span class="status-title status-title-' + status.id + '">' + ui.esc(status.title) + "</span></div>" +
      '<div class="status-domain">' + ui.esc(entry.domain) + "</div></div>" +
      '<div class="detail-rows">' +
      detailRow(FACTS.risk, detailValue(verdict.riskLevel(entry))) +
      detailRow(
        FACTS.score,
        '<span class="detail-score"><span class="score-track"><span class="score-fill score-fill-' + status.id +
          '" style="width:' + verdict.scorePercent(score) + '%"></span></span>' + detailValue(score.toFixed(2)) + "</span>"
      ) +
      detailRow(FACTS.date, detailValue(time.formatDateTime(entry.ts))) +
      detailRow(FACTS.source, '<span class="hu-chip">' + ui.esc(verdict.sourceLabel(entry.source)) + "</span>") +
      "</div>" +
      '<div class="flex-spacer"></div>' +
      '<div class="detail-note">Solo se guarda el dominio, no la dirección completa.</div>' +
      "</section>"
    );
  }

  function clearConfirm() {
    return (
      '<div class="confirm-overlay"><div class="confirm-card" role="dialog" aria-modal="true" aria-label="Borrar historial">' +
      '<h2 class="confirm-title">¿Borrar tu historial?</h2>' +
      '<p class="confirm-text">Se elimina de tu cuenta. No se puede deshacer.</p>' +
      '<div class="confirm-actions">' +
      ui.button({ label: "No", variant: "ghost", action: "cancel-clear" }) +
      ui.button({ label: "Sí, borrar", variant: "danger", action: "confirm-clear-yes" }) +
      "</div></div></div>"
    );
  }

  Sereno.historyUi = {
    listView: listView,
    detailView: detailView,
    clearConfirm: clearConfirm
  };
})(globalThis.Sereno = globalThis.Sereno || {});

/* Design system · molecules: small groups of atoms reused by several
   organisms (labelled field, legend item, data table card). Classic script
   that extends Sereno.ui. Presentational only. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;

  /* Labelled free-text input with optional help text.
     options: { label, name, type, placeholder, hasError, help, helpIsError, value } */
  function field(options) {
    return (
      '<label class="field"><span class="field-label">' + ui.esc(options.label) + "</span>" +
      ui.input({
        cls: ui.classes(["input", options.hasError && "has-error"]),
        type: options.type,
        name: options.name,
        placeholder: options.placeholder,
        value: options.value,
        assist: true
      }) +
      (options.help
        ? '<span class="' + ui.classes(["field-help", options.helpIsError && "field-help-error"]) + '">' + ui.esc(options.help) + "</span>"
        : "") +
      "</label>"
    );
  }

  /* Icon followed by its caption, as used by chart and icon legends. */
  function legendItem(iconHtml, text) {
    return '<span class="legend-item">' + iconHtml + ui.esc(text) + "</span>";
  }

  /* Card holding a data table. options: { headHtml, tableCls, columns, rows }
     where rows is a list of cell HTML lists. */
  function tableCard(options) {
    var head = options.columns
      .map(function (column) {
        return "<th>" + ui.esc(column) + "</th>";
      })
      .join("");
    var body = options.rows
      .map(function (cells) {
        return "<tr>" + cells.map(function (cell) {
          return "<td>" + cell + "</td>";
        }).join("") + "</tr>";
      })
      .join("");
    return (
      '<div class="card table-card">' + (options.headHtml || "") +
      '<table class="data-table ' + options.tableCls + '"><thead><tr>' + head + "</tr></thead>" +
      "<tbody>" + body + "</tbody></table></div>"
    );
  }

  ui.field = field;
  ui.legendItem = legendItem;
  ui.tableCard = tableCard;
})(globalThis.Sereno = globalThis.Sereno || {});

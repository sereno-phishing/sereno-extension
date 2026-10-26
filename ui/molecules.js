/* Design system · molecules: small groups of atoms reused by several
   organisms (labelled field, legend item, data table card). Classic script
   that extends Sereno.ui. Presentational only. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;

  /* Labelled free-text input with optional help text. The label span names the
     input (aria-labelledby) so the help text inside the label does not pollute
     its name; the help text describes it. A field marked invalid says so.
     options: { label, name, type, placeholder, hasError, invalid, help, helpIsError, value,
     id, autocomplete, describedBy } — describedBy adds ids (such as a form error) after the help. */
  function field(options) {
    var id = options.id || "field-" + options.name;
    var describedBy = [options.help ? id + "-help" : "", options.describedBy].filter(Boolean).join(" ");
    var invalid = options.invalid !== undefined ? options.invalid : options.hasError;
    return (
      '<label class="field"><span class="field-label" id="' + id + '-label">' + ui.esc(options.label) + "</span>" +
      ui.input({
        cls: ui.classes(["input", options.hasError && "has-error"]),
        type: options.type,
        name: options.name,
        placeholder: options.placeholder,
        value: options.value,
        autocomplete: options.autocomplete,
        id: id,
        labelledBy: id + "-label",
        invalid: invalid,
        describedBy: describedBy,
        assist: true
      }) +
      (options.help
        ? '<span class="' + ui.classes(["field-help", options.helpIsError && "field-help-error"]) + '" id="' + id + '-help">' + ui.esc(options.help) + "</span>"
        : "") +
      "</label>"
    );
  }

  /* Icon followed by its caption, as used by chart and icon legends. */
  function legendItem(iconHtml, text) {
    return '<span class="legend-item">' + iconHtml + ui.esc(text) + "</span>";
  }

  /* Card holding a data table. options: { headHtml, tableCls, columns, rows, caption }
     where rows is a list of cell HTML lists. The caption names the table for assistive
     technology only; an empty column title is an actions column and gets a hidden name. */
  function tableCard(options) {
    var head = options.columns
      .map(function (column) {
        return '<th scope="col">' + (column ? ui.esc(column) : '<span class="sr-only">Acciones</span>') + "</th>";
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
      '<table class="data-table ' + options.tableCls + '">' +
      '<caption class="sr-only">' + ui.esc(options.caption) + "</caption><thead><tr>" + head + "</tr></thead>" +
      "<tbody>" + body + "</tbody></table></div>"
    );
  }

  ui.field = field;
  ui.legendItem = legendItem;
  ui.tableCard = tableCard;
})(globalThis.Sereno = globalThis.Sereno || {});

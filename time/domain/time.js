/* Time: pure date/stamp helpers shared by every domain. Classic script that
   registers Sereno.time. No clock access: callers pass the Date to format. */

(function (Sereno) {
  "use strict";

  function pad2(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function isoDay(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  /* Local "YYYY-MM-DDTHH:MM" stamp: the format stored in history, sessions and users. */
  function stamp(date) {
    return isoDay(date) + "T" + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function parse(value) {
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function dayText(date) {
    return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear();
  }

  /* "DD/MM/YYYY HH:MM"; unparseable input is returned as is. */
  function formatDateTime(value) {
    var date = parse(value);
    if (!date) {
      return value || "";
    }
    return dayText(date) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  /* "DD/MM/YYYY"; unparseable input is returned as is. */
  function formatDate(value) {
    var date = parse(value);
    return date ? dayText(date) : value || "";
  }

  /* YYYY-MM-DD rendered without timezone drift (plain Date parsing would
     shift the day in negative offsets); anything else falls back to formatDate. */
  function formatDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (match) {
      return match[3] + "/" + match[2] + "/" + match[1];
    }
    return formatDate(value);
  }

  /* Accepts either an ISO day or an already formatted DD/MM/YYYY day. */
  function formatAnyDay(value) {
    var text = String(value || "");
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      return text;
    }
    return formatDay(text);
  }

  Sereno.time = {
    pad2: pad2,
    isoDay: isoDay,
    stamp: stamp,
    formatDateTime: formatDateTime,
    formatDate: formatDate,
    formatDay: formatDay,
    formatAnyDay: formatAnyDay
  };
})(globalThis.Sereno = globalThis.Sereno || {});

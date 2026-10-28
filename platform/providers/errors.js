/* Platform · transport errors as the UI shows them. Classic script that
   registers Sereno.providers.errors. Pure: it maps the error codes of a port
   result ("timeout" | "offline" | "server" | "cache_down", see ports.js) to
   Spanish text and builds the normalized failure every data use case returns:
     { ok: false, error, message } */

(function (Sereno) {
  "use strict";

  Sereno.providers = Sereno.providers || {};

  var MESSAGES = {
    timeout: "El servidor tardó demasiado en responder. Inténtalo de nuevo.",
    offline: "Sin conexión. Revisa tu red e inténtalo de nuevo.",
    server: "El servidor no está disponible. Inténtalo más tarde.",
    cache_down: "El caché de veredictos no está disponible. Inténtalo más tarde.",
    forbidden: "Solo una cuenta de administrador puede gestionar las políticas por dominio.",
    already_submitted: "Esta cuenta ya participó en la encuesta. Gracias por tu opinión."
  };
  var CODES = Object.keys(MESSAGES);

  /* Unknown or missing codes read as a server problem. */
  function normalize(error) {
    return CODES.indexOf(error) >= 0 ? error : "server";
  }

  function message(error) {
    return MESSAGES[normalize(error)];
  }

  function failure(error) {
    var code = normalize(error);
    return { ok: false, error: code, message: MESSAGES[code] };
  }

  Sereno.providers.errors = {
    CODES: CODES,
    normalize: normalize,
    message: message,
    failure: failure
  };
})(globalThis.Sereno = globalThis.Sereno || {});

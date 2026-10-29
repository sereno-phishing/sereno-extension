/* Popup-owned presentation copy. Backend values are never catalog keys. */
(function (Sereno) {
  "use strict";
  var translations = {
    "Historial": "History", "Política de privacidad": "Privacy policy", "Secciones": "Sections", "Inicio": "Home",
    "Administración": "Administration", "Métricas, política por dominio y caché.": "Metrics, domain policy and cache.", "Abrir panel de administración": "Open administration panel",
    "Inicia sesión para guardar tu historial.": "Sign in to save your history.", "Iniciar sesión": "Sign in", "Crear cuenta": "Create account",
    "Sin conexión con el servidor. Usamos tu sesión guardada en este dispositivo.": "Cannot connect to the server. Your session saved on this device is in use.", "Reintentar": "Retry",
    "No leemos el contenido de la página": "We do not read page content", "No guardamos la dirección completa": "We do not save the full address", "Funciona sin crear una cuenta": "Works without creating an account",
    "Nada se interrumpe": "Nothing is interrupted", "Puedes volver o continuar": "You can go back or continue", "No se puede seguir": "You cannot continue",
    "Revisamos el sitio antes de que pagues": "We check the site before you pay", "Si el enlace es seguro, sigues navegando. Si parece phishing, te avisamos antes de que ingreses tus datos.": "If the link is safe, you can continue browsing. If it looks like phishing, we warn you before you enter your information.",
    "Qué permiso necesitamos": "What permission we need", "Solo leemos la dirección de la pestaña actual para evaluarla.": "We only read the current tab's address to evaluate it.", "Cómo leer una alerta": "How to read an alert",
    "La protección queda activa en modo Advertencia. No tienes que configurar nada.": "Protection stays active in Warning mode. You do not need to configure anything.",
    "Atrás": "Back", "Empezar": "Get started", "Siguiente": "Next", "Paso ": "Step ", " de ": " of ",
    "Todas": "All", "Seguro": "Safe", "Advertencia": "Warning", "Bloqueado": "Blocked", "Evaluando…": "Checking…", "Sitio seguro": "Safe site", "Sitio bloqueado": "Blocked site", "Evaluación pendiente": "Evaluation pending",
    "Todavía no hay sitios evaluados en esta cuenta.": "No sites have been evaluated on this account yet.", "Cuando navegues, los sitios aparecerán aquí.": "Sites will appear here as you browse.", "No hay sitios con este resultado.": "No sites have this result.", "Cargando tu historial...": "Loading your history...", "Borrar historial": "Clear history", "Detalle del sitio": "Site details", "Detalle de ": "Details of ",
    "Nivel de riesgo": "Risk level", "Score del modelo": "Model score", "Fecha de clasificación": "Classification date", "Fuente del veredicto": "Verdict source", "Alto": "High", "Medio": "Medium", "Bajo": "Low", "Caché": "Cache", "Modelo": "Model",
    "Solo se guarda el dominio, no la dirección completa.": "Only the domain is saved, not the full address.", "¿Borrar tu historial?": "Clear your history?", "Se elimina de tu cuenta. No se puede deshacer.": "It will be removed from your account. This cannot be undone.", "No": "No", "Sí, borrar": "Yes, clear",
    "El servidor tardó demasiado en responder. Inténtalo de nuevo.": "The server took too long to respond. Try again.", "Sin conexión. Revisa tu red e inténtalo de nuevo.": "Offline. Check your connection and try again.", "El servidor no está disponible. Inténtalo más tarde.": "The server is unavailable. Try again later.", "El caché de veredictos no está disponible. Inténtalo más tarde.": "The verdict cache is unavailable. Try again later.", "Solo una cuenta de administrador puede gestionar las políticas por dominio.": "Only an administrator account can manage domain policies.", "Esta cuenta ya participó en la encuesta. Gracias por tu opinión.": "This account has already completed the survey. Thank you for your feedback.",
    "Activa": "Active", "Inactiva": "Inactive", "Sin conexión": "Offline", "Algunas comprobaciones no están disponibles.": "Some checks are unavailable.", "Protección activa": "Protection active", "Modo por defecto: Advertencia": "Default mode: Warning", "Este sitio": "This site", "No se pudo comprobar este sitio. Evita ingresar datos de pago.": "This site could not be checked. Avoid entering payment information.", "Estados del ícono": "Icon states", "Modelo actualizado a v": "Model updated to v", "Se actualizó en el servidor. No tienes que reinstalar nada.": "It was updated on the server. You do not need to reinstall anything."
  };
  if (Sereno.i18n && Sereno.i18n.register) {
    var entries = {};
    Object.keys(translations).forEach(function (text) { entries["popup." + text] = { es: text, en: translations[text] }; });
    Sereno.i18n.register(entries);
  }
  function t(text) { return Object.prototype.hasOwnProperty.call(translations, text) && Sereno.i18n && Sereno.i18n.t ? Sereno.i18n.t("popup." + text) : text; }
  function pill(id, size) {
    var status = Sereno.verdict.status(id);
    return Sereno.ui.pill("pill-" + size + " pill-" + status.tone,
      Sereno.verdictUi.badge(id, size === "sm" ? "12" : "14") + "<span>" + Sereno.ui.esc(t(status.label)) + "</span>");
  }
  Sereno.popupI18n = { t: t, pill: pill };
})(globalThis.Sereno = globalThis.Sereno || {});

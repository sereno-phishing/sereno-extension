/* Onboarding · presentational view of the three-step walkthrough. Classic
   script that registers Sereno.onboardingUi. Takes the step, returns HTML. */

(function (Sereno) {
  "use strict";

  var ui = Sereno.ui;
  var verdict = Sereno.verdict;
  var verdictUi = Sereno.verdictUi;
  var onboarding = Sereno.onboarding;

  var PERMISSION_CHECKS = [
    "No leemos el contenido de la página",
    "No guardamos la dirección completa",
    "Funciona sin crear una cuenta"
  ];

  /* What each final verdict means for the user, in verdict order. */
  var VERDICT_MEANINGS = {
    seguro: "Nada se interrumpe",
    advertencia: "Puedes volver o continuar",
    bloqueo: "No se puede seguir"
  };

  function title(text) {
    return '<h1 class="onboarding-title">' + ui.esc(text) + "</h1>";
  }

  function body(text, cls) {
    return '<p class="' + ui.classes(["onboarding-body", cls]) + '">' + ui.esc(text) + "</p>";
  }

  function checkItem(text) {
    return '<div class="check-item">' + ui.art("ok", "16") + "<span>" + ui.esc(text) + "</span></div>";
  }

  function legendRow(statusId) {
    return (
      '<div class="legend-row">' + verdictUi.pill(statusId, "md") +
      '<span class="legend-row-text">' + ui.esc(VERDICT_MEANINGS[statusId]) + "</span></div>"
    );
  }

  function stepWhat() {
    return (
      '<div class="illustration"><span class="illust-logo-wrap">' +
      ui.logo("illust-logo", "") + ui.icon("ok", "illust-badge") + "</span></div>" +
      title("Revisamos el sitio antes de que pagues") +
      body("Si el enlace es seguro, sigues navegando. Si parece phishing, te avisamos antes de que ingreses tus datos.")
    );
  }

  function stepPermission() {
    return (
      '<div class="illustration">' + ui.logo("illust-logo", "") + "</div>" +
      title("Qué permiso necesitamos") +
      body("Solo leemos la dirección de la pestaña actual para evaluarla.") +
      '<div class="check-list">' + PERMISSION_CHECKS.map(checkItem).join("") + "</div>"
    );
  }

  function stepAlerts() {
    return (
      '<div class="illustration"><div class="illust-circles">' +
      verdict.VERDICTS.map(function (id) {
        return verdictUi.badge(id, "40");
      }).join("") +
      "</div></div>" +
      title("Cómo leer una alerta") +
      '<div class="legend-rows">' + verdict.VERDICTS.map(legendRow).join("") + "</div>" +
      body("La protección queda activa en modo Advertencia. No tienes que configurar nada.", "onboarding-note")
    );
  }

  function progressDots(step) {
    var html = '<div class="dots">';
    for (var index = 1; index <= onboarding.STEP_COUNT; index += 1) {
      html += '<span class="' + ui.classes(["dot-step", index === step && "active"]) + '"></span>';
    }
    return html + "</div>";
  }

  function controls(step) {
    var last = step >= onboarding.STEP_COUNT;
    return (
      '<div class="onboarding-controls">' + progressDots(step) + '<div class="onboarding-buttons">' +
      (step > 1 ? ui.button({ label: "Atrás", variant: "ghost", action: "onboarding-back" }) : "") +
      ui.button({
        label: last ? "Empezar" : "Siguiente",
        variant: "primary",
        action: last ? "onboarding-start" : "onboarding-next"
      }) +
      "</div></div>"
    );
  }

  var STEPS = [stepWhat, stepPermission, stepAlerts];

  function view(step) {
    return '<section class="view view-onboarding">' + STEPS[step - 1]() + controls(step) + "</section>";
  }

  /* Header counter, e.g. "2 de 3". */
  function stepCounter(step) {
    return '<span class="step-counter">' + step + " de " + onboarding.STEP_COUNT + "</span>";
  }

  Sereno.onboardingUi = {
    view: view,
    stepCounter: stepCounter
  };
})(globalThis.Sereno = globalThis.Sereno || {});

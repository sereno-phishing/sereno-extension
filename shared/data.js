/* Sereno seed data. Classic script: exposes window.SERENO_DATA.
   Plain JSON-like data only (no DOM, no storage access). */

(function () {
  "use strict";

  var DEFAULT_STATE = {
    onboardingDone: false,
    session: null,
    users: [
      {
        username: "andres.torres",
        password: "sereno123",
        role: "usuario",
        createdAt: "2026-09-01T10:00:00"
      },
      {
        username: "admin.sereno",
        password: "sereno123",
        role: "administrador",
        createdAt: "2026-09-01T10:00:00"
      }
    ],
    history: {
      "andres.torres": [
        { id: "h-000001", domain: "pago-servicios-linea.net", status: "bloqueo", score: 0.97, source: "cache", ts: "2026-09-21T10:14", latencyMs: 38 },
        { id: "h-000002", domain: "tienda-servicios.pe", status: "seguro", score: 0.04, source: "modelo", ts: "2026-09-21T09:12", latencyMs: 171 },
        { id: "h-000003", domain: "paypal-secure-login.com", status: "advertencia", score: 0.92, source: "modelo", ts: "2026-09-20T18:03", latencyMs: 186 },
        { id: "h-000004", domain: "reservas-hotel.pe", status: "seguro", score: 0.06, source: "modelo", ts: "2026-09-20T16:40", latencyMs: 149 },
        { id: "h-000005", domain: "banco-verifica-cuenta.com", status: "advertencia", score: 0.88, source: "modelo", ts: "2026-09-19T21:55", latencyMs: 203 },
        { id: "h-000006", domain: "entradas-concierto.pe", status: "seguro", score: 0.05, source: "modelo", ts: "2026-09-19T12:30", latencyMs: 138 }
      ]
    },
    currentSite: { domain: "tienda-servicios.pe", status: "seguro", score: 0.04, source: "modelo", ts: "2026-09-21T09:12:00" },
    domains: [
      { domain: "pago-servicios-linea.net", policy: "bloqueo", updatedAt: "2026-09-21" },
      { domain: "paypal-secure-login.com", policy: "advertencia", updatedAt: "2026-09-20" },
      { domain: "banco-verifica-cuenta.com", policy: "bloqueo", updatedAt: "2026-09-19" }
    ],
    survey: { answers: [], completedAt: null },
    modelNoticeDismissed: false,
    cache: {
      ttlPhishingDays: 7,
      ttlLegitHours: 24,
      invalidations: [
        { domain: "reservas-hotel.pe", status: "Se reevaluará en la próxima consulta", date: "2026-09-22" },
        { domain: "entradas-concierto.pe", status: "Reevaluado: seguro", date: "2026-09-18" }
      ]
    }
  };

  var SUS_QUESTIONS = [
    "Creo que me gustaría usar Sereno con frecuencia.",
    "Encontré que Sereno era innecesariamente complejo.",
    "Me pareció que Sereno era fácil de usar.",
    "Creo que necesitaría apoyo técnico para poder usar Sereno.",
    "Encontré que las distintas funciones de Sereno estaban bien integradas.",
    "Encontré que Sereno era demasiado inconsistente.",
    "Imagino que la mayoría de la gente aprendería a usar Sereno muy rápido.",
    "Encontré que Sereno era muy engorroso de usar.",
    "Me sentí muy seguro/a usando Sereno.",
    "Necesité aprender muchas cosas antes de poder empezar a usar Sereno."
  ];

  /* Fixed dashboard data for the options page. The hourly bars are segment
     heights in px and reproduce the shape of the metrics mockup: short bars on
     the left, the tallest cluster around the middle-right, one prominent tall
     red bar at position 14 and amber segments scattered across the chart. */
  var METRICS = {
    analyzed: 1284,
    deltaPct: 12,
    phishingPct: 8.3,
    phishingCount: 107,
    latencyMs: 142,
    latencyTargetMs: 200,
    cacheHitPct: 67,
    hourly: [
      { seguro: 52, advertencia: 0, bloqueo: 0 },
      { seguro: 40, advertencia: 0, bloqueo: 0 },
      { seguro: 24, advertencia: 12, bloqueo: 0 },
      { seguro: 32, advertencia: 8, bloqueo: 0 },
      { seguro: 12, advertencia: 0, bloqueo: 20 },
      { seguro: 28, advertencia: 0, bloqueo: 0 },
      { seguro: 36, advertencia: 16, bloqueo: 0 },
      { seguro: 64, advertencia: 0, bloqueo: 0 },
      { seguro: 76, advertencia: 12, bloqueo: 0 },
      { seguro: 96, advertencia: 0, bloqueo: 0 },
      { seguro: 24, advertencia: 0, bloqueo: 60 },
      { seguro: 88, advertencia: 20, bloqueo: 0 },
      { seguro: 100, advertencia: 24, bloqueo: 0 },
      { seguro: 20, advertencia: 0, bloqueo: 116 },
      { seguro: 116, advertencia: 24, bloqueo: 0 },
      { seguro: 108, advertencia: 16, bloqueo: 0 },
      { seguro: 92, advertencia: 24, bloqueo: 0 },
      { seguro: 80, advertencia: 20, bloqueo: 0 },
      { seguro: 68, advertencia: 0, bloqueo: 0 },
      { seguro: 48, advertencia: 16, bloqueo: 0 },
      { seguro: 32, advertencia: 0, bloqueo: 0 }
    ],
    queries: [
      { domain: "pago-servicios-linea.net", stamp: "21/09/2026 10:14", source: "Caché", latencyMs: 38, status: "bloqueo" },
      { domain: "tienda-servicios.pe", stamp: "21/09/2026 09:12", source: "Modelo", latencyMs: 171, status: "seguro" },
      { domain: "paypal-secure-login.com", stamp: "20/09/2026 18:03", source: "Modelo", latencyMs: 186, status: "advertencia" },
      { domain: "reservas-hotel.pe", stamp: "20/09/2026 16:40", source: "Modelo", latencyMs: 149, status: "seguro" },
      { domain: "banco-verifica-cuenta.com", stamp: "20/09/2026 15:22", source: "Caché", latencyMs: 41, status: "advertencia" },
      { domain: "entradas-concierto.pe", stamp: "20/09/2026 12:30", source: "Modelo", latencyMs: 138, status: "seguro" },
      { domain: "tienda-servicios.pe", stamp: "20/09/2026 11:05", source: "Caché", latencyMs: 36, status: "seguro" },
      { domain: "oferta-express.pe", stamp: "20/09/2026 10:48", source: "Modelo", latencyMs: 193, status: "advertencia" },
      { domain: "pago-servicios-linea.net", stamp: "20/09/2026 09:31", source: "Caché", latencyMs: 44, status: "bloqueo" },
      { domain: "reservas-hotel.pe", stamp: "19/09/2026 21:12", source: "Caché", latencyMs: 39, status: "seguro" },
      { domain: "banco-verifica-cuenta.com", stamp: "19/09/2026 19:57", source: "Modelo", latencyMs: 202, status: "advertencia" },
      { domain: "entradas-concierto.pe", stamp: "19/09/2026 18:26", source: "Caché", latencyMs: 42, status: "seguro" },
      { domain: "mega-descuentos.pe", stamp: "19/09/2026 16:03", source: "Modelo", latencyMs: 178, status: "bloqueo" },
      { domain: "tienda-servicios.pe", stamp: "19/09/2026 14:45", source: "Modelo", latencyMs: 155, status: "seguro" },
      { domain: "paypal-secure-login.com", stamp: "19/09/2026 12:18", source: "Caché", latencyMs: 37, status: "advertencia" },
      { domain: "reservas-hotel.pe", stamp: "19/09/2026 10:02", source: "Modelo", latencyMs: 166, status: "seguro" },
      { domain: "pago-servicios-linea.net", stamp: "18/09/2026 22:41", source: "Caché", latencyMs: 35, status: "bloqueo" },
      { domain: "sorteo-premios.pe", stamp: "18/09/2026 20:17", source: "Modelo", latencyMs: 207, status: "bloqueo" },
      { domain: "tienda-servicios.pe", stamp: "18/09/2026 18:55", source: "Caché", latencyMs: 40, status: "seguro" },
      { domain: "entradas-concierto.pe", stamp: "18/09/2026 17:29", source: "Modelo", latencyMs: 134, status: "seguro" },
      { domain: "banco-verifica-cuenta.com", stamp: "18/09/2026 15:44", source: "Caché", latencyMs: 43, status: "advertencia" },
      { domain: "reservas-hotel.pe", stamp: "18/09/2026 13:08", source: "Modelo", latencyMs: 158, status: "seguro" },
      { domain: "factura-electronica.pe", stamp: "18/09/2026 11:36", source: "Modelo", latencyMs: 189, status: "advertencia" },
      { domain: "tienda-servicios.pe", stamp: "18/09/2026 09:21", source: "Caché", latencyMs: 34, status: "seguro" },
      { domain: "pago-servicios-linea.net", stamp: "17/09/2026 21:50", source: "Modelo", latencyMs: 196, status: "bloqueo" },
      { domain: "entradas-concierto.pe", stamp: "17/09/2026 19:14", source: "Caché", latencyMs: 38, status: "seguro" },
      { domain: "banco-verifica-cuenta.com", stamp: "17/09/2026 17:02", source: "Modelo", latencyMs: 187, status: "advertencia" },
      { domain: "reservas-hotel.pe", stamp: "17/09/2026 15:33", source: "Caché", latencyMs: 41, status: "seguro" },
      { domain: "tienda-servicios.pe", stamp: "17/09/2026 13:11", source: "Modelo", latencyMs: 152, status: "seguro" },
      { domain: "paypal-secure-login.com", stamp: "17/09/2026 10:47", source: "Modelo", latencyMs: 191, status: "advertencia" },
      { domain: "oferta-express.pe", stamp: "16/09/2026 20:26", source: "Caché", latencyMs: 45, status: "advertencia" },
      { domain: "entradas-concierto.pe", stamp: "16/09/2026 18:39", source: "Modelo", latencyMs: 141, status: "seguro" },
      { domain: "reservas-hotel.pe", stamp: "16/09/2026 16:15", source: "Caché", latencyMs: 33, status: "seguro" }
    ]
  };

  window.SERENO_DATA = {
    defaultState: DEFAULT_STATE,
    susQuestions: SUS_QUESTIONS,
    metrics: METRICS
  };
})();

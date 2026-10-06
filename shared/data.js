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

  /* Fixed dashboard data for the options page, copied from the Figma metrics
     frame. Each hourly bar is one solid colour (level) with its height in px
     inside a 110px chart; sparklines are the heights (px) of the 7 mini bars
     inside the 36px strip of each stat card. */
  var METRICS = {
    analyzed: 1284,
    deltaPct: 12,
    phishingPct: 8.3,
    phishingCount: 107,
    latencyMs: 142,
    latencyTargetMs: 200,
    cacheHitPct: 67,
    sparklines: {
      indigo: [14.4, 18, 16.2, 21.6, 25.2, 23.4, 32.4],
      red: [10.8, 18, 14.4, 12.6, 21.6, 16.2, 18],
      amber: [25.2, 21.6, 23.4, 18, 19.8, 18, 16.2],
      green: [14.4, 16.2, 18, 19.8, 21.6, 22.32, 24.12]
    },
    hourly: [
      { level: "seguro", height: 33 },
      { level: "seguro", height: 27.5 },
      { level: "advertencia", height: 22 },
      { level: "bloqueo", height: 16.5 },
      { level: "seguro", height: 13.2 },
      { level: "seguro", height: 19.8 },
      { level: "seguro", height: 33 },
      { level: "advertencia", height: 49.5 },
      { level: "seguro", height: 66 },
      { level: "seguro", height: 77 },
      { level: "bloqueo", height: 88 },
      { level: "seguro", height: 82.5 },
      { level: "advertencia", height: 77 },
      { level: "seguro", height: 79.2 },
      { level: "seguro", height: 85.8 },
      { level: "seguro", height: 93.5 },
      { level: "seguro", height: 99 },
      { level: "bloqueo", height: 88 },
      { level: "seguro", height: 77 },
      { level: "seguro", height: 71.5 },
      { level: "seguro", height: 66 },
      { level: "seguro", height: 55 },
      { level: "advertencia", height: 46.2 },
      { level: "seguro", height: 38.5 }
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

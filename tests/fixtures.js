/* Test fixtures: the data a backend could hold, written out so each test reads
   what it depends on. Nothing here ships with the extension. Every export is a
   function that returns a fresh copy, so tests never share mutable data. */

"use strict";

const USERS = [
  { username: "andres.torres", password: "sereno123", isAdmin: false, createdAt: "2026-09-01T10:00:00" },
  { username: "admin.sereno", password: "sereno123", isAdmin: true, createdAt: "2026-09-01T10:00:00" }
];

/* Records as the backend serves them: the model class plus the policy in force. */
const HISTORY = {
  "andres.torres": [
    { id: "h-000001", domain: "pago-servicios-linea.net", verdict: "phishing", policy: "bloqueo", score: 0.97, source: "cache", ts: "2026-09-21T10:14", latencyMs: 38 },
    { id: "h-000002", domain: "tienda-servicios.pe", verdict: "legitima", policy: "advertencia", score: 0.04, source: "modelo", ts: "2026-09-21T09:12", latencyMs: 171 },
    { id: "h-000003", domain: "paypal-secure-login.com", verdict: "phishing", policy: "advertencia", score: 0.92, source: "modelo", ts: "2026-09-20T18:03", latencyMs: 186 },
    { id: "h-000004", domain: "reservas-hotel.pe", verdict: "legitima", policy: "advertencia", score: 0.06, source: "modelo", ts: "2026-09-20T16:40", latencyMs: 149 },
    { id: "h-000005", domain: "banco-verifica-cuenta.com", verdict: "phishing", policy: "advertencia", score: 0.88, source: "modelo", ts: "2026-09-19T21:55", latencyMs: 203 },
    { id: "h-000006", domain: "entradas-concierto.pe", verdict: "legitima", policy: "advertencia", score: 0.05, source: "modelo", ts: "2026-09-19T12:30", latencyMs: 138 }
  ]
};

const DOMAINS = [
  { domain: "pago-servicios-linea.net", policy: "bloqueo", updatedAt: "2026-09-21" },
  { domain: "paypal-secure-login.com", policy: "advertencia", updatedAt: "2026-09-20" },
  { domain: "banco-verifica-cuenta.com", policy: "bloqueo", updatedAt: "2026-09-19" }
];

const CACHE = {
  ttlPhishingDays: 7,
  ttlLegitHours: 24,
  invalidations: [
    { domain: "reservas-hotel.pe", verdict: null, date: "2026-09-22" },
    { domain: "entradas-concierto.pe", verdict: "legitima", date: "2026-09-18" }
  ]
};

/* What the classifier answers per domain; any other domain is legitimate. */
const CLASSIFICATIONS = {
  "tienda-servicios.pe": { verdict: "legitima", score: 0.04, source: "modelo", latencyMs: 142 },
  "paypal-secure-login.com": { verdict: "phishing", score: 0.92, source: "modelo", latencyMs: 186 },
  "pago-servicios-linea.net": { verdict: "phishing", score: 0.97, source: "cache", latencyMs: 38 }
};

/* Dashboard shape of GET /v1/metrics. Heights are pixels inside the chart. */
const METRICS = {
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
    { level: "advertencia", height: 22 },
    { level: "bloqueo", height: 16.5 },
    { level: "seguro", height: 66 }
  ],
  queries: [
    { domain: "pago-servicios-linea.net", stamp: "21/09/2026 10:14", source: "Caché", latencyMs: 38, status: "bloqueo" },
    { domain: "tienda-servicios.pe", stamp: "21/09/2026 09:12", source: "Modelo", latencyMs: 171, status: "seguro" },
    { domain: "paypal-secure-login.com", stamp: "20/09/2026 18:03", source: "Modelo", latencyMs: 186, status: "advertencia" },
    { domain: "reservas-hotel.pe", stamp: "20/09/2026 16:40", source: "Modelo", latencyMs: 149, status: "seguro" },
    { domain: "banco-verifica-cuenta.com", stamp: "20/09/2026 15:22", source: "Caché", latencyMs: 41, status: "advertencia" },
    { domain: "entradas-concierto.pe", stamp: "20/09/2026 12:30", source: "Modelo", latencyMs: 138, status: "seguro" }
  ]
};

const MODEL_VERSION = "2.0.0";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  MODEL_VERSION,
  users: () => copy(USERS),
  history: () => copy(HISTORY),
  domains: () => copy(DOMAINS),
  cache: () => copy(CACHE),
  classifications: () => copy(CLASSIFICATIONS),
  metrics: () => copy(METRICS)
};

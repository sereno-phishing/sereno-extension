# Sereno

Sereno es una extensión anti-phishing para Chrome (Manifest V3). Evalúa cada
página http/https que abres y muestra el resultado de tres formas: el badge del
ícono, un aviso dentro de la página y el detalle en el popup. Incluye el popup
completo, el panel de administración, la política de privacidad y una tienda de
demo para probar los flujos.

El front end está terminado y funciona con un proveedor **mock** (datos de
ejemplo, sin red). Cuando exista el backend, se conecta cambiando el proveedor
en `platform/providers/config.js` y el origen en `manifest.json`; la sección
[Conectar el backend](#conectar-el-backend) tiene los pasos.

**Estado de la verificación.** `node --test` cubre dominios, casos de uso,
vistas (HTML y DOM simulado), el service worker, el content script y la
equivalencia entre mock y remote. La extensión **nunca se ha cargado en Chrome
real** durante este desarrollo y no se ha probado contra un backend real. Lo que
las pruebas automáticas no cubren está en
[Verificación manual en Chrome](#verificación-manual-en-chrome).

## Requisitos

- Google Chrome 102 o superior (Manifest V3, `chrome.storage.session` e
  `inert`). También debería funcionar en navegadores basados en Chromium (Edge,
  Brave, Opera), sin probar.
- Para usarlo no necesitas Node.js, un servidor ni conexión a internet.
- Para correr las pruebas, Node 18 o superior, sin dependencias.
- Carga la carpeta tal cual, sin instalar dependencias ni compilar.

## Instalación

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta `sereno-extension`.
5. (Opcional) Abre el menú de extensiones y fija Sereno en la barra para ver el
   ícono y el badge.
6. Si cambias código, pulsa **Recargar** en la tarjeta de la extensión. El
   service worker no se actualiza solo.

## Cómo probar la demo

1. Abre el popup de Sereno. La primera vez verás el onboarding de 3 pasos
   (qué hace, qué permiso necesita y cómo leer una alerta). Pulsa **Empezar**.
2. Inicia sesión con una de las cuentas demo (contraseña `sereno123` para
   ambas), o crea una cuenta nueva si prefieres ver el historial vacío:
   - `andres.torres` (rol usuario): historial con datos, pestañas Inicio/Historial.
   - `admin.sereno` (rol administrador): tarjeta de administración y acceso al panel.
3. Abre la tienda de demo desde el panel de administración (botón
   **Abrir tienda de demo**, abajo a la izquierda) o directamente en
   `chrome-extension://<ID>/app/demo-store/store.html`, reemplazando `<ID>` por el ID de
   la extensión que muestra `chrome://extensions`.
4. Prueba los 4 escenarios del simulador, en la esquina inferior izquierda:
   - Sitio seguro: badge verde `✓` y tooltip «Sereno: sitio seguro».
   - Advertencia: modal ámbar con la opción de **Ver detalle** o
     **Continuar bajo riesgo**.
   - Bloqueo: modal rojo sin opción de continuar.
   - Pendiente: toast «Evaluación pendiente».
   Cada escenario pasa por un estado «Evaluando…» de ~0.7 s antes del veredicto.
5. Vuelve al popup para ver el estado del sitio y el historial de la navegación
   que simulaste. En el panel de administración puedes ver las métricas,
   los dominios y la caché de esa operación. Con `andres.torres` ves la experiencia
   de usuario (pestañas Inicio/Historial); con `admin.sereno` ves la tarjeta de
   administración que abre el panel. La tarjeta «Este sitio» aparece con y sin sesión.

Para empezar de cero, borra el historial desde el popup. También puedes quitar
y volver a cargar la extensión en `chrome://extensions` para restaurar los datos
semilla.

### En pestañas reales (proveedor mock)

El service worker evalúa cada navegación http/https con el mismo proveedor. El
mock solo conoce los dominios de los escenarios; cualquier otro dominio da
«seguro».

| Dominio | Veredicto del mock |
| --- | --- |
| `tienda-servicios.pe` | Seguro |
| `paypal-secure-login.com` | Advertencia |
| `pago-servicios-linea.net` | Bloqueo |
| cualquier otro | Seguro |

El badge se pinta al empezar la navegación, aunque el dominio no resuelva. El
aviso en página solo aparece si la página llega a cargar. Esto no se ha probado
en Chrome real.

## Mapa de vistas ↔ HU

Todo funciona con el mock. «Backend» indica qué dato real depende de él cuando
se conecte; las vistas no cambian.

| Vista o flujo | HU | Dónde se ve | Estado |
| --- | --- | --- | --- |
| Cargar Sereno en Chrome | HU-01 | `manifest.json`, `chrome://extensions` | Listo |
| Onboarding de 3 pasos | HU-03 | Popup, primera apertura | Listo |
| Sitio seguro | HU-04 | Badge de la pestaña, popup (estado), tooltip de la tienda de demo | Listo con mock; badge real sin probar en Chrome |
| Advertencia | HU-05 | Modal ámbar en la página y en la tienda de demo | Listo con mock; modal real sin probar en Chrome |
| Crear cuenta | HU-13 | Popup → Crear cuenta | Listo con mock; backend verifica credenciales |
| Iniciar sesión | HU-14 | Popup → Iniciar sesión | Listo con mock; backend verifica credenciales |
| Cerrar sesión | HU-15 | Popup → menú de cuenta → Cerrar sesión | Listo; sale en local aunque el backend no responda |
| Historial | HU-17 | Popup → pestaña Historial | Listo con mock; backend guarda las visitas |
| Filtrar historial | HU-18 | Popup → Historial → chips de filtro | Listo |
| Borrar historial | HU-19 | Popup → Historial → Borrar historial | Listo con mock; backend |
| Detalle del veredicto | HU-20 | Popup → detalle del historial y «Ver detalle» del aviso | Listo |
| Política por dominio | HU-21 | Panel de administración → Política por dominio | Listo con mock; backend |
| Bloqueo | HU-22 | Modal rojo en la página y en la tienda de demo | Listo con mock; modal real sin probar en Chrome |
| Política de privacidad | HU-23 | `app/privacy/privacy.html`, enlace del pie del popup | Listo |
| Estado de la protección | HU-24 | Popup → tarjeta «Protección activa» y estado del sitio | Listo |
| Evaluación pendiente | HU-25 | Badge `…`, toast en página, estado «Evaluando…» | Listo con mock |
| Protección degradada | HU-26 | Badge `?`, aviso en página, tarjeta ámbar del popup | Listo; el popup no explica la causa (ver abajo) |
| Versión del modelo | HU-27 | Pie del popup (misma versión con y sin sesión) y aviso «Modelo actualizado» (solo con sesión, cuando la versión del backend difiere de la última vista) | Solo la lectura (`GET /v1/model`); el entrenamiento queda fuera |
| Caché | HU-28 | Panel de administración → Caché | Listo con mock; backend |
| Métricas de operación | HU-29 | Panel de administración → Métricas | Listo con mock; el cálculo es del backend |
| Encuesta SUS | HU-32 | Popup → menú de cuenta → Encuesta de opinión | Listo con mock; backend recibe las respuestas |

Pendiente conocido en HU-26: el popup muestra «Protección degradada» sin la
causa (sin conexión, tiempo agotado, servidor o caché). El aviso en página sí
la muestra. Falta guardar la causa en el estado compartido, que toca el
service worker y el contenedor del popup.

## Estructura del proyecto

Las carpetas de primer nivel corresponden a los dominios del negocio. Cada
dominio se divide en `domain/` (reglas puras), `application/` (casos de uso que
reciben los puertos como parámetros) y `ui/` (vistas presentacionales que reciben
datos y devuelven HTML). Las páginas están en `app/`; los bordes técnicos, en
`platform/` y `ui/`.

```
sereno-extension/
├── manifest.json                 # MV3: worker, content script, popup, options_page, permisos y CSP
├── app/                          # Raíces de composición: una carpeta por página
│   ├── popup/                    # popup.html/.css, popup-views.js (plantilla), popup-page.js (contenedor)
│   ├── admin/                    # admin.html/.css, admin-views.js (plantilla), admin-page.js (contenedor)
│   ├── demo-store/               # store.html/.css, store-page.js (contenedor del simulador)
│   └── privacy/                  # privacy.html/.css (página estática)
├── background/                   # service-worker.js: escucha las pestañas y delega en navigation-service
├── content/                      # content-script.js (contenedor del aviso en página) y content.css
├── verdict/                      # Veredicto y su resultado normalizado (outcome), caso de uso verdict-service, aviso en página, pills y badge
├── account/                      # Usuarios, sesión con token, roles; formularios y menú de cuenta
├── history/                      # Historial: deduplicación 60 s, tope 200, filtros; lista y detalle
├── survey/                       # Encuesta SUS: preguntas y puntaje; vistas de la encuesta
├── onboarding/                   # Recorrido de 3 pasos
├── protection/                   # Sitio actual, nivel de protección, versión del modelo; navigation-service (navegación → veredicto, badge, mensaje)
├── administration/               # Política por dominio y caché (reglas, casos de uso, secciones del panel)
├── demo-store/                   # Escenarios del simulador y modal de veredicto (compartido con las páginas reales)
├── time/                         # Fechas y sellos de tiempo (funciones puras)
├── platform/                     # Bordes técnicos
│   ├── providers/                # La costura del backend (ver «Conectar el backend»)
│   │   ├── config.js             # El interruptor: provider, baseUrl, timeoutMs
│   │   ├── ports.js              # Contrato de los puertos (verdict, auth, data)
│   │   ├── mock.js               # Adaptador con datos de ejemplo
│   │   ├── remote.js             # Adaptador REST (HTTP + JSON)
│   │   ├── errors.js             # Códigos de error de transporte y su texto en español
│   │   └── index.js              # Raíz de composición: crea Sereno.services
│   ├── storage.js                # Puerto de almacenamiento: chrome.storage, localStorage o memoria
│   ├── state-store.js            # Store reactivo compartido entre páginas (cola, sync externo)
│   ├── browser.js                # Badge por pestaña, mensajes al content script, registros por pestaña
│   ├── preferences.js            # Preferencias de UI del popup (pestaña recordada)
│   └── seed.js                   # Datos semilla: usuarios, historial, dominios, caché, métricas
├── ui/                           # Sistema de diseño
│   ├── tokens.css                # Design tokens y clases base
│   ├── verdict-modal.css         # Estilos del modal, compartidos por la tienda y las páginas reales
│   ├── atoms.js                  # Átomos: esc, imagen/ícono, botón, chip, pill, input, banner
│   ├── molecules.js              # Moléculas: campo con etiqueta, ítem de leyenda, tarjeta con tabla
│   └── dom.js                    # Arranque de página y delegación de clics (data-action)
├── tests/                        # Pruebas con node:test (dominios, casos de uso, vistas, worker, manifest, arquitectura, cambio de proveedor)
├── odd/tasks/                    # Seguimiento del trabajo (tareas, decisiones y evidencia)
├── assets/                       # Logo, íconos SVG y fuente Inter
└── icons/                        # icon16, icon32, icon48, icon128
```

## Notas técnicas

- **Manifest V3, sin compilación.** Los scripts son clásicos. Cada archivo es una
  IIFE que se registra en el único espacio de nombres `globalThis.Sereno` (por
  ejemplo, `Sereno.history` o `Sereno.verdictUi`). Cada página los carga con
  etiquetas `<script>` en orden: plataforma, proveedores, dominios, casos de uso,
  átomos, vistas y por último el contenedor. El service worker los carga con
  `importScripts`; el content script, con la lista `js` del manifest.
- **Capas.** Los archivos `*/domain/*` son puros: no usan `window`, `document`,
  `chrome` ni `localStorage`. Los casos de uso reciben los puertos como
  parámetros (`services` para el backend, `store` para el estado local) y nunca
  lanzan: devuelven `{ ok, ... }` o `{ ok: false, error, message }`. Solo
  `platform/` toca `chrome.*`. Las vistas reciben datos y devuelven HTML, sin
  acceso al store ni eventos. Los contenedores (`app/*/*-page.js`,
  `content/content-script.js`) tienen el estado de la página, la delegación de
  eventos y la suscripción.
- **Una sola costura al backend.** Nada fuera de `platform/providers/` usa `fetch`,
  `XMLHttpRequest` ni un adaptador. Todo lo demás depende de `Sereno.services`
  (`verdict`, `auth`, `data`). `tests/architecture.test.js` lo verifica.
- **Service worker** (`background/service-worker.js`). Registra de forma síncrona
  `tabs.onUpdated`, `tabs.onActivated`, `tabs.onRemoved` y `runtime.onMessage`, y
  delega en `Sereno.navigationService`. No guarda estado en variables globales ni
  usa temporizadores: el resultado de cada pestaña vive en `chrome.storage.session`
  (clave `sereno.tab.<tabId>`) y el estado del popup, en el store compartido. Si
  el proveedor falla, la navegación sigue (ver «Regla fail-open»).
- **Badge en pestañas reales.** El worker pinta el badge de la pestaña que navega
  con `chrome.action.setBadgeText` / `setBadgeBackgroundColor` y el `tabId` del
  evento: `✓` seguro, `!` advertencia, `✕` bloqueo, `…` evaluando, `?` protección
  degradada. Al cambiar de pestaña vuelve a pintar el resultado guardado. Solo la
  pestaña activa alimenta el estado del popup. Una navegación nueva en la misma
  pestaña invalida un resultado anterior que llegue tarde.
- **Content script** (`content/content-script.js`, http/https, `document_idle`,
  solo el marco superior). Escucha el mensaje del worker, pide el resultado actual
  al cargar y dibuja el aviso dentro de un shadow root cerrado en `<html>`, con
  hojas de estilo de la extensión. Muestra un `<dialog>` nativo con `showModal()`
  (fondo inerte, foco atrapado y devuelto): la advertencia se puede cerrar y el
  bloqueo no. Un toast cubre «Evaluando…» y una nota cubre la protección
  degradada. No conoce servicios, proveedores ni red.
- **Mensajes.**
  - Worker → pestaña: `{ type: "sereno:outcome", outcome, acknowledged? }` con
    `outcome` = `{ kind: "verdict", verdict: { domain, status, score, source, latencyMs } }`
    | `{ kind: "pending", reason: "evaluating" }`
    | `{ kind: "degraded", reason: "offline" | "timeout" | "server" | "cache_down" }`.
    Llega primero un `pending` solo si la espera supera 300 ms, y el resultado final
    se reenvía cuando la pestaña termina de cargar, así que el receptor trata un
    resultado igual como idempotente. No se envía al activar una pestaña.
  - Content script → worker (`chrome.runtime.sendMessage`):
    `{ type: "sereno:get-outcome" }`, `{ type: "sereno:continue", url }` (solo
    advertencias del mismo origen; un bloqueo se rechaza) y
    `{ type: "sereno:detail", url }` (abre el popup en una pestaña).
- **Estado local.** Se guarda en `chrome.storage.local` bajo la clave
  `sereno.state.v1`. El store también acepta `localStorage` o memoria para probarlo
  en Node. La sesión guarda el usuario sin contraseña y un token opaco.
- **Permisos** (el mínimo que usa el código):
  - `storage`: estado compartido (`local`) y resultados por pestaña (`session`).
  - `tabs`: leer `tab.url` y `changeInfo.url` en el worker. Sin este permiso (ni
    permisos de host) Chrome no entrega la URL. Es el que muestra el aviso de
    «historial de navegación» al instalar.
  - `host_permissions`: vacío con el mock. Con backend lleva solo su origen.
  - Sin `activeTab`, `scripting` ni `<all_urls>`: el content script se declara en
    el manifest, que le da acceso a las páginas http/https sin permisos de host.
- **CSP.** Las páginas de la extensión declaran `script-src 'self'; object-src
  'self'` (igual que el valor por defecto de MV3, pero explícito). El HTML no usa
  `onclick`, CDNs, fuentes ni imágenes remotas. No se restringe `connect-src`; si
  quieres endurecerlo, es otro cambio a mano al conectar el backend.
- **Recursos expuestos.** `web_accessible_resources` lista solo lo que el aviso en
  página carga (3 hojas de estilo, el logo y 5 íconos), para http/https. Una
  página puede detectar que Sereno está instalado al pedir esos recursos; no se
  usó `use_dynamic_url` porque exige Chrome 130 o superior.
- **Versión mínima.** `minimum_chrome_version` es 102: `chrome.storage.session` e
  `inert` la exigen. `<dialog closedby>` es una mejora progresiva y no impone
  versión.
- **Accesibilidad.** Regiones `aria-live` en los estados, pestañas con teclado
  (flechas, Inicio, Fin), foco atrapado y devuelto en confirmaciones, enlace para
  saltar al contenido, anillo de foco, movimiento reducido y contrastes AA
  comprobados por prueba. Las pruebas son de cadena y DOM simulado; no se usó un
  lector de pantalla.
- Los datos simulados de usuarios, historial, reglas por dominio, caché y
  métricas están en `platform/seed.js`, y solo el adaptador mock los lee. El botón
  **Abrir tienda de demo** del panel de administración abre
  `app/demo-store/store.html`.
- Ejecuta las pruebas con `node --test` desde la raíz. Necesitas Node 18 o
  superior, sin dependencias.

## Conectar el backend

La promesa: el cliente no cambia, cambia el proveedor. Estos son **todos** los
puntos que se tocan, sin maquillar:

| # | Archivo | Qué se edita | Cuándo |
| --- | --- | --- | --- |
| 1 | `platform/providers/config.js` | `provider`, `baseUrl`, `timeoutMs` | Siempre |
| 2 | `manifest.json` | `host_permissions` con el origen del backend | Siempre que el backend esté en otro origen (lo normal) y no responda CORS para la extensión |
| 3 | `platform/providers/remote.js` | Rutas o formas de respuesta | Solo si la API real difiere del contrato de abajo |

Son dos archivos si el backend sigue el contrato, y tres si no. Interfaz,
contenedores, dominios y casos de uso no se tocan.

### Pasos

1. En `platform/providers/config.js`:

   ```js
   Sereno.providers.config = {
     provider: "remote",
     baseUrl: "https://api.sereno.example",   // origen, sin ruta final
     timeoutMs: 4000,
     mockDelayMs: 700
   };
   ```

2. En `manifest.json`, reemplaza el arreglo vacío:

   ```json
   "host_permissions": ["https://api.sereno.example/*"],
   ```

   Es lo recomendado frente a CORS: el origen es fijo y propio, el permiso es
   estrecho (un solo origen) y no exige configurar `Access-Control-Allow-*` para
   `chrome-extension://<id>` con credenciales. `optional_host_permissions` no
   aplica: pedirlo en ejecución necesita un gesto del usuario y código nuevo, y la
   evaluación corre en segundo plano. Si prefieres CORS, deja `host_permissions`
   vacío y haz que el backend responda el origen `chrome-extension://<id>`, con
   preflight y credenciales.

   `tests/manifest.test.js` falla si `config.js` dice `remote` y
   `host_permissions` no contiene exactamente `<baseUrl>/*` (y exige `https`).
   Así este paso no se olvida.

3. Cookies de sesión: las peticiones usan `credentials: "include"`. Como el
   origen de la extensión es otro sitio, el backend normalmente tendrá que
   marcarlas `Secure` y `SameSite=None`. Esto no se ha probado con un backend
   real.

4. Recarga la extensión en `chrome://extensions` y revisa la lista de
   [Verificación manual en Chrome](#verificación-manual-en-chrome).

5. Corre `node --test` desde la raíz. `tests/provider-switch.test.js` ejecuta los
   mismos escenarios con `mock` y con `remote` (contra un backend simulado) y
   exige resultados idénticos. Ese archivo es la prueba ejecutable de la promesa;
   no sustituye probar contra el backend real.

### Contrato REST

Todas las rutas cuelgan de `baseUrl`. Cuerpos JSON, con `credentials: "include"`.
Un 2xx devuelve exactamente el resultado del puerto sin `ok` (el adaptador lo
añade).

| Método | Ruta | Petición | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| POST | `/v1/verdict` | `{ url }` | `{ domain, status, score, source, latencyMs }` | `timeout`, `server`, `cache_down` |
| POST | `/v1/auth/login` | `{ username, password }` | `{ user, token }` | 401 `{ error: "invalid" }` |
| POST | `/v1/auth/register` | `{ username, password }` | `{ user, token }` | 409 `duplicate`, 400 `invalid` |
| POST | `/v1/auth/logout` | `{}` | `{}` | |
| GET | `/v1/auth/session` | | `{ session }` (`null` sin sesión) | |
| GET | `/v1/history` | | `{ entries }` | |
| DELETE | `/v1/history` | | `{}` | |
| GET | `/v1/domains` | | `{ domains }` | |
| PUT | `/v1/domains` | `{ domains }` | `{}` | |
| GET | `/v1/cache` | | `{ cache }` | `cache_down` |
| PUT | `/v1/cache/ttl` | `{ ttlPhishingDays, ttlLegitHours }` | `{ cache }` | |
| POST | `/v1/cache/invalidations` | `{ domain }` | `{ cache }` | |
| GET | `/v1/metrics` | | `{ metrics }` | |
| GET | `/v1/model` | | `{ version }` | |
| POST | `/v1/survey` | `{ answers }` | `{}` | |

Formas:

- `status`: `"seguro"`, `"advertencia"` o `"bloqueo"`. `source`: `"cache"` o `"modelo"`.
- `user`: `{ username, role, createdAt }`, con `role` `"usuario"` o `"administrador"`.
  Nunca lleva la contraseña. `token` es opaco.
- `session`: `{ username, role, loginAt, token? }`.
- `entries`: `[{ id, domain, status, score, source, ts, latencyMs }]`, del usuario con sesión.
- `domains`: `[{ domain, policy, updatedAt }]` con `policy` `"advertencia"` o `"bloqueo"`.
  `PUT` reemplaza la lista completa.
- `cache`: `{ ttlPhishingDays, ttlLegitHours, invalidations: [{ domain, status, date }] }`.
- `metrics`: la forma del panel (`Sereno.seed.metrics` en `platform/seed.js`).
- `answers`: diez valores de la escala SUS.
- `POST /v1/verdict` también registra la visita en el historial del usuario con
  sesión: el cliente nunca escribe el historial.

Errores: un cuerpo no 2xx `{ error }` con un código conocido se pasa tal cual
(`invalid`, `duplicate`, `cache_down`, `timeout`, `offline`, `server`). Un 504 es
`timeout`; cualquier otro fallo es `server`. Sin red es `offline`. Si no hay
respuesta en `timeoutMs`, el adaptador aborta la petición y devuelve `timeout`.

### Puertos

Cada método es asíncrono y no lanza. Devuelve `{ ok: true, ... }` o
`{ ok: false, error }`, con `error` en `timeout | offline | server | cache_down`
(transporte) o `invalid | duplicate` (dominio). Definidos en
`platform/providers/ports.js`.

| Puerto | Método |
| --- | --- |
| `verdict` | `evaluate(url)` |
| `auth` | `login(username, password)`, `register(username, password)`, `logout()`, `session()` |
| `data` | `listHistory()`, `deleteHistory()`, `getDomainPolicies()`, `putDomainPolicies(domains)`, `getCache()`, `setCacheTtl(phishingDays, legitHours)`, `invalidateCache(domain)`, `getMetrics()`, `getModelVersion()`, `submitSurvey(answers)` |

### Regla fail-open

Una protección degradada **nunca bloquea**. Solo un veredicto `bloqueo` real
detiene la navegación. Si el backend, la red o el caché fallan, la página carga,
el badge muestra `?`, el popup indica «Protección degradada» y la página muestra
un aviso. Bloquear durante una caída dejaría sin acceso a sitios legítimos cada
vez que el servicio falle. La decisión está en `verdict/domain/outcome.js`.

Dos plazos: el adaptador remoto corta a los `timeoutMs` (4 s por defecto) y el
caso de uso tiene su propio límite de 6 s. «Evaluando…» aparece solo si la espera
pasa de 300 ms.

### Cuentas de demo (solo mock)

| Usuario | Contraseña | Rol |
| --- | --- | --- |
| `andres.torres` | `sereno123` | usuario, con historial |
| `admin.sereno` | `sereno123` | administrador |

Con `remote` estas cuentas no existen en el cliente: el backend verifica las
credenciales.

### Verificación manual en Chrome

Nada de esto se ha hecho. Cárgala descomprimida, abre las DevTools del service
worker (`chrome://extensions` → «service worker») y revisa:

- [ ] Carga sin errores ni avisos en `chrome://extensions`; el nombre, la
      descripción y la versión salen como en el manifest.
- [ ] Badge en una pestaña real: `✓`, `!`, `✕`, `…` y `?` según el caso, y cada
      pestaña conserva el suyo al cambiar entre ellas.
- [ ] Modal en una página real: advertencia (se cierra con Esc, «Volver»,
      «Continuar bajo riesgo», «Ver detalle») y bloqueo (sin Esc, sin continuar).
- [ ] Un sitio con CSP estricta (por ejemplo, con `style-src` restringido): las
      hojas de estilo de la extensión dentro del shadow root deben cargar. Si no,
      pasar a `content_scripts.css` o a una hoja construida.
- [ ] Navegación en una SPA (`pushState`): el worker solo ve `loading` y
      `complete`, así que un cambio de ruta del lado del cliente no se vuelve a
      evaluar. Confirmar el comportamiento y decidir si se usa
      `webNavigation.onHistoryStateUpdated`.
- [ ] Foco e `inert`: el foco entra al diálogo, no sale con Tab, vuelve al cerrar
      y el fondo no responde. Revisar también el popup (pestañas con flechas,
      menú de cuenta, confirmación de borrado) y el panel (enlace para saltar).
- [ ] Reinicio del service worker: detenerlo desde `chrome://serviceworker-internals`
      o esperar a que se duerma, navegar y comprobar que el badge, el modal y
      «Continuar bajo riesgo» siguen funcionando con el estado guardado.
- [ ] La fuente: `@font-face` no aplica dentro de un shadow root, así que el modal
      usa la fuente sans-serif del sistema en páginas reales. Aceptarlo o cargar
      Inter en el documento.
- [ ] Un lector de pantalla recorre el modal, los estados de carga y el popup.
- [ ] Con backend: cookies de sesión (`Secure`, `SameSite=None`), permiso de host
      en la tarjeta de la extensión, y los cuatro fallos (sin red, tiempo agotado,
      500, caché caído) muestran el estado degradado sin bloquear.

## Skills obligatorios

Antes de crear, modificar o depurar cualquier parte de la extensión (manifest,
service worker, content scripts, popup, permisos o publicación), se debe usar
el skill `chrome-extensions` (GoogleChrome/modern-web-guidance). Está en
`.agents/skills/chrome-extensions` y en `.claude/skills/`. Para HTML, CSS y JS
del lado del cliente, usa también `modern-web-guidance`.

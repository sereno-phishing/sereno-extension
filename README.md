# Sereno

Sereno es una extensión anti-phishing para Chrome (Manifest V3). Evalúa cada
página http/https que abres y muestra el resultado de tres formas: el badge del
ícono, un aviso dentro de la página y el detalle en el popup. Incluye el popup
completo, el panel de administración y la política de privacidad.

Todos los datos vienen del backend de Sereno, publicado en
`https://sereno-phishing.chilecentral.cloudapp.azure.com`: veredictos,
historial, caché, métricas, versión del modelo, autenticación, encuestas SUS y
políticas por dominio. La extensión no clasifica ni trae datos de ejemplo: si el
backend no responde, la protección queda degradada y el popup y el panel
muestran el error de conexión. Para desarrollar contra el backend hermano en
`http://127.0.0.1:5000`, ver [Conectar el backend](#conectar-el-backend).

**Estado de la verificación.** `node --test` cubre dominios, casos de uso,
vistas (HTML y DOM simulado), el service worker, el content script y el
adaptador remoto contra un backend falso solo de pruebas (`tests/rest-fake.js`)
que responde el contrato REST. Isolated Node HTTP tests also exercise the
real local backend on throwaway PostgreSQL databases through the remote adapter: auth,
surveys, policies, verdicts, history, cache, metrics and model version.
**Real Chrome cookie behavior remains unverified**; Node supplies its own test
cookie jar and does not enforce browser cookie policy. Manual checks remain in
[Verificación manual en Chrome](#verificación-manual-en-chrome).

## Requisitos

- Google Chrome 102 o superior (Manifest V3, `chrome.storage.session` e
  `inert`). También debería funcionar en navegadores basados en Chromium (Edge,
  Brave, Opera), sin probar.
- Acceso al backend publicado o, para desarrollo, el backend Flask hermano
  corriendo en local (ver [Conectar el backend](#conectar-el-backend)).
- Para correr las pruebas, Node 18 o superior, sin dependencias. Las tres
  pruebas contra el backend real necesitan además su entorno virtual y sus
  contenedores de PostgreSQL y Redis; sin ellos se omiten con un aviso.
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

## Idioma

Con sesión iniciada, abre el menú de cuenta desde el badge de usuario o administrador
para elegir español o inglés. La preferencia se
comparte entre las vistas y se conserva en el almacenamiento local de la extensión;
si aún no existe, se usa el idioma del navegador (español para idiomas no admitidos).
La encuesta SUS también sigue el selector de idioma (las respuestas guardadas son enteros 1-5 y no
dependen del idioma). Los datos
devueltos por el backend no se traducen. La descripción que Chrome muestra en la
lista de extensiones usa el idioma del navegador, independientemente del selector.

## Cómo probarla

1. Carga o recarga la extensión. Por defecto usa el backend publicado; para
   usar el local, enciéndelo y cambia `baseUrl` (ver
   [Conectar el backend](#conectar-el-backend)).
2. Abre el popup de Sereno. La primera vez verás el onboarding de 3 pasos
   (qué hace, qué permiso necesita y cómo leer una alerta). Pulsa **Empezar**.
   Antes de la primera navegación, la tarjeta «Este sitio» está en reposo:
   dice «Aún no hay un sitio evaluado.» y «Sereno evaluará el próximo sitio que
   visites.», sin dominio ni estado.
3. Create a throwaway account in the popup. Backend registration always creates
   a regular user (`isAdmin: false`). To test the administrator panel, promote
   the throwaway account offline as documented in [Conectar el backend](#conectar-el-backend).
4. Navega a cualquier página http/https. El service worker pide el veredicto al
   backend, pinta el badge de la pestaña y publica el sitio en el popup; con
   sesión iniciada, el backend registra la visita en el historial de la cuenta.
5. Vuelve al popup para ver el estado del sitio y el historial. Con una cuenta
   de usuario ves las pestañas Inicio/Historial; con una cuenta de administrador
   ves además la tarjeta que abre el panel, con las métricas, las políticas y
   el caché que sirve el backend. La tarjeta «Este sitio» aparece con y sin sesión.

Para empezar de cero, borra el historial desde el popup. Quitar y volver a
cargar la extensión en `chrome://extensions` borra el estado local (sesión,
onboarding y borradores de encuesta); los datos del backend no cambian.

### En pestañas reales

El service worker evalúa cada navegación http/https a través del puerto
`verdict`. Al activar una pestaña ya abierta sin resultado guardado, también
evalúa su URL sin necesidad de refrescarla. Si la página se abrió antes de
cargar la extensión, el aviso dentro de la página puede requerir una recarga
para instalar el content script; el badge y el popup no la requieren.

Cada navegación nueva de una pestaña, incluida la recarga de la misma URL,
vuelve a consultar al backend, así que se aplica la política vigente del
dominio (el backend guarda el veredicto en caché por URL, por lo que la consulta
es barata). Los demás eventos de esa misma navegación (`complete`, activar la
pestaña) reutilizan el resultado guardado. Una pestaña abierta que no se recarga
no se actualiza sola. «Continuar bajo riesgo» se recuerda por pestaña y origen,
pero solo omite una advertencia: si la política pasa a `bloqueo`, el bloqueo se
muestra igual.

Las páginas del propio backend (mismo origen que `baseUrl`: esquema, host y
puerto) no se evalúan: no hay petición a `/v1/verdict`, aviso, badge ni entrada
en el historial, y el popup muestra «Sereno no evalúa esta página.». Solo ese
origen queda exento; otras direcciones locales o privadas se evalúan como
cualquier sitio. Lo mismo vale para lo que no es http(s) (páginas internas del
navegador, otras extensiones, archivos locales, `about:blank`): si esa pestaña
es la activa, la tarjeta «Este sitio» dice «Sereno no evalúa esta página.» en
vez de conservar el último sitio evaluado, y al volver a una pestaña evaluada
muestra de nuevo su resultado guardado, sin otra petición. La página de detalle
de Sereno (el popup abierto en una pestaña) conserva el sitio que explica.

El backend solo dice la clase del modelo, `phishing` o `legitima`, y la política
del dominio. La extensión aplica esa política (RF-10) en un único lugar,
`applyPolicy` de `verdict/domain/verdict.js`: un sitio legítimo queda «seguro» y
uno de phishing queda en «advertencia» o «bloqueo» según la política. La
política sale de la lista del panel de administración (por defecto,
`advertencia`).

| Respuesta del backend | Lo que muestra la extensión |
| --- | --- |
| `legitima` | Seguro: badge verde `✓`, sin aviso en página |
| `phishing`, política `advertencia` | Advertencia: badge ámbar `!` y modal con Volver, Ver detalle y Continuar bajo riesgo |
| `phishing`, política `bloqueo` | Bloqueo: badge rojo `✕` y modal sin opción de continuar |
| sin respuesta pasados 300 ms | Badge `…` y toast «Evaluación pendiente» hasta que llega el veredicto |
| error de red, tiempo agotado, servidor o caché | Badge `?` y aviso «Protección degradada»; la página no se bloquea |

El aviso en página solo aparece si la página llega a cargar: con un dominio que
no resuelve, el badge se pinta al empezar la navegación, pero el content script
no se ejecuta. Esto no se ha probado en Chrome real.

## Mapa de vistas ↔ HU

Todos los datos los sirve el backend; las vistas no dependen de quién
los produce. «Estado» indica lo que falta verificar.

| Vista o flujo | HU | Dónde se ve | Estado |
| --- | --- | --- | --- |
| Cargar Sereno en Chrome | HU-01 | `manifest.json`, `chrome://extensions` | Listo |
| Onboarding de 3 pasos | HU-03 | Popup, primera apertura | Listo |
| Sitio seguro | HU-04 | Badge de la pestaña, popup (estado) | Listo; verificado en Chrome |
| Advertencia | HU-05 | Modal ámbar en la página | Listo; verificado en Chrome |
| Crear cuenta | HU-13 | Popup → Crear cuenta | Local backend; Chrome verification pending |
| Iniciar sesión | HU-14 | Popup → Iniciar sesión | Local backend; Chrome verification pending |
| Cerrar sesión | HU-15 | Popup → menú de cuenta → Cerrar sesión | Listo; sale en local aunque el backend no responda |
| Historial | HU-17 | Popup → pestaña Historial | Listo; el backend guarda las visitas |
| Filtrar historial | HU-18 | Popup → Historial → chips de filtro | Listo |
| Borrar historial | HU-19 | Popup → Historial → Borrar historial | Listo; borra en el backend |
| Detalle del veredicto | HU-20 | Popup → detalle del historial y «Ver detalle» del aviso | Listo |
| Política por dominio | HU-21 | Panel de administración → Política por dominio | Backend local; solo administrador; el cambio de política se verificó en Chrome |
| Bloqueo | HU-22 | Modal rojo en la página | Listo; verificado en Chrome |
| Política de privacidad | HU-23 | `privacy/ui/privacy-views.js`, vista dentro del popup desde el enlace del pie | Listo |
| Estado de la protección | HU-24 | Popup → tarjeta «Protección activa» y estado del sitio | Listo |
| Evaluación pendiente | HU-25 | Badge `…`, toast en página, estado «Evaluando…» | Listo |
| Protección degradada | HU-25 | Badge `?`, aviso en página, tarjeta ámbar del popup | Listo; el popup no explica la causa (ver abajo) |
| Versión del modelo | HU-27 | Pie del popup (misma versión con y sin sesión) y aviso «Modelo actualizado» (solo con sesión, cuando la versión del backend difiere de la última vista) | Solo la lectura (`GET /v1/model`); el entrenamiento queda fuera |
| Caché | HU-28 | Panel de administración → Caché | Listo; solo administrador |
| Métricas de operación | HU-29 | Panel de administración → Métricas | Listo; solo administrador; el cálculo es del backend |
| Encuesta SUS | HU-32 | Popup → menú de cuenta → Encuesta de opinión | Envío al backend local; tras confirmar la participación, la opción desaparece para esa cuenta; borradores locales por cuenta; Chrome pendiente |

Pendiente conocido en la protección degradada (HU-25): el popup muestra «Protección degradada» sin la
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
│   └── admin/                    # admin.html/.css, admin-views.js (plantilla), admin-page.js (contenedor)
├── background/                   # service-worker.js: escucha las pestañas y delega en navigation-service
├── content/                      # content-script.js (contenedor del aviso en página), content.css y content-assets.generated.js (estilos e íconos empaquetados; no se edita)
├── tools/                        # build-content-assets.js: genera content-assets.generated.js (paso de desarrollo)
├── verdict/                      # Veredicto y su resultado normalizado (outcome), caso de uso verdict-service, aviso en página, modal de veredicto, pills y badge
├── account/                      # Usuarios, sesión con token, roles; formularios y menú de cuenta
├── history/                      # Historial: deduplicación 60 s, tope 200, filtros; lista y detalle
├── survey/                       # Encuesta SUS: escala y puntaje; vistas bilingües de la encuesta
├── privacy/                      # Política de privacidad: vista bilingüe dentro del popup
├── onboarding/                   # Recorrido de 3 pasos
├── protection/                   # Sitio actual, nivel de protección, versión del modelo; navigation-service (navegación → veredicto, badge, mensaje)
├── administration/               # Política por dominio y caché (reglas, casos de uso, secciones del panel)
├── time/                         # Fechas y sellos de tiempo (funciones puras)
├── platform/                     # Bordes técnicos
│   ├── providers/                # La costura del backend (ver «Conectar el backend»)
│   │   ├── config.js             # Dirección del backend (baseUrl) y plazo de las peticiones (timeoutMs)
│   │   ├── ports.js              # Contrato de los puertos (verdict, auth, data, survey)
│   │   ├── remote.js             # Adaptador REST (HTTP + JSON)
│   │   ├── errors.js             # Códigos de error de transporte y su texto en español
│   │   └── index.js              # Raíz de composición: crea Sereno.services
│   ├── storage.js                # Puerto de almacenamiento: chrome.storage, localStorage o memoria
│   ├── state-store.js            # Store reactivo compartido entre páginas (cola, sync externo) y estado inicial
│   ├── browser.js                # Badge por pestaña, mensajes al content script, registros por pestaña
│   └── preferences.js            # Preferencias de UI del popup (pestaña recordada)
├── ui/                           # Sistema de diseño
│   ├── tokens.css                # Design tokens y clases base
│   ├── verdict-modal.css         # Estilos del modal de veredicto del aviso en página
│   ├── atoms.js                  # Átomos: esc, imagen/ícono, botón, chip, pill, input, banner
│   ├── molecules.js              # Moléculas: campo con etiqueta, ítem de leyenda, tarjeta con tabla
│   └── dom.js                    # Arranque de página y delegación de clics (data-action)
├── tests/                        # Pruebas con node:test (dominios, casos de uso, vistas, worker, manifest, arquitectura); rest-fake.js y fixtures.js son ayudas solo de pruebas
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
  (`verdict`, `auth`, `data`, `survey`). `tests/architecture.test.js` lo verifica.
- **Service worker** (`background/service-worker.js`). Registra de forma síncrona
  `tabs.onUpdated`, `tabs.onActivated`, `tabs.onRemoved`,
  `windows.onFocusChanged` y `runtime.onMessage`, y
  delega en `Sereno.navigationService`. No guarda estado en variables globales ni
  usa temporizadores: el resultado de cada pestaña vive en `chrome.storage.session`
  (clave `sereno.tab.<tabId>`) y el estado del popup, en el store compartido. Si
  el backend falla, la navegación sigue (ver «Regla fail-open»).
- **Badge en pestañas reales.** El worker pinta el badge de la pestaña que navega
  con `chrome.action.setBadgeText` / `setBadgeBackgroundColor` y el `tabId` del
  evento: `✓` seguro, `!` advertencia, `✕` bloqueo, `…` evaluando, `?` protección
  degradada. Al cambiar de pestaña vuelve a pintar el resultado guardado. Solo la
  pestaña activa de la ventana enfocada alimenta el estado del popup (se
  republica al navegar, al cambiar de pestaña y al cambiar de ventana). Una navegación nueva en la misma
  pestaña invalida un resultado anterior que llegue tarde.
- **Content script** (`content/content-script.js`, http/https, `document_idle`,
  solo el marco superior). Escucha el mensaje del worker, pide el resultado actual
  al cargar y dibuja el aviso dentro de un shadow root cerrado en `<html>`, con
  estilos e íconos empaquetados en el propio script (ver «Estilos e íconos del
  aviso en página»). Muestra un `<dialog>` nativo con `showModal()`
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
  en Node. La sesión guarda el usuario sin contraseña y un token opaco. Una
  instalación nueva empieza sin sesión y sin sitio actual (`DEFAULT_STATE` en
  `platform/state-store.js`).
- **Permisos** (el mínimo que usa el código):
  - `storage`: estado compartido (`local`) y resultados por pestaña (`session`).
  - `tabs`: leer `tab.url` y `changeInfo.url` en el worker. Sin este permiso (ni
    permisos de host) Chrome no entrega la URL. Es el que muestra el aviso de
    «historial de navegación» al instalar.
  - `host_permissions`: `https://sereno-phishing.chilecentral.cloudapp.azure.com/*`
    (backend publicado) y `http://127.0.0.1:5000/*` (backend local de
    desarrollo), para veredictos, datos, autenticación, encuestas y políticas;
    no se añade comodín de hosts ni acceso a la API `cookies`. **Antes de enviar
    la extensión a Chrome Web Store, quita la entrada `http://127.0.0.1:5000/*`**
    y ajusta `tests/manifest.test.js`, que la exige: solo sirve para desarrollo.
  - Sin `activeTab`, `scripting` ni `<all_urls>`: el content script se declara en
    el manifest, que le da acceso a las páginas http/https sin permisos de host.
- **CSP.** Las páginas de la extensión declaran `script-src 'self'; object-src
  'self'` (igual que el valor por defecto de MV3, pero explícito). El HTML no usa
  `onclick`, CDNs, fuentes ni imágenes remotas. No se restringe `connect-src`,
  así que nada bloquea las peticiones al backend; si se endurece, debe incluir
  los orígenes de `host_permissions`.
- **Estilos e íconos del aviso en página.** La página nunca pide una URL
  `chrome-extension://`: el manifest no declara `web_accessible_resources`, así que
  ningún sitio puede detectar la extensión pidiendo sus archivos. Los estilos
  (`ui/tokens.css`, `ui/verdict-modal.css`, `content/content.css`) y los íconos que
  usa el aviso (`assets/icons/alert-*`, `toast-pending-32`, `brand`) viajan dentro de
  `content/content-assets.generated.js`, que registra `Sereno.contentAssets`. El
  content script crea una `CSSStyleSheet`, la llena con `replaceSync` y la asigna a
  `shadow.adoptedStyleSheets` (una hoja construida no depende del `style-src` de la
  página). Si el navegador no la admite, usa un `<style>` con el mismo texto. Los
  íconos se dibujan como `<svg>` en línea (`Sereno.ui.setInlineAssets`), no como
  `<img>`, y el logo del pie del modal es la marca `brand` en SVG. El popup y el
  panel no cambian: siguen cargando sus archivos desde su propia
  página. **El archivo generado se versiona.** Tras editar `ui/tokens.css`,
  `ui/verdict-modal.css`, `content/content.css` o un ícono del aviso, ejecuta
  `node tools/build-content-assets.js` (`--check` solo verifica). Si lo olvidas,
  `tests/content-assets.test.js` falla. Al generar se descarta `@font-face`, así que
  la fuente Inter no se aplica en el aviso en página: usa la fuente del sistema.
- **Versión mínima.** `minimum_chrome_version` es 102: `chrome.storage.session` e
  `inert` la exigen. `<dialog closedby>` es una mejora progresiva y no impone
  versión.
- **Accesibilidad.** Regiones `aria-live` en los estados, pestañas con teclado
  (flechas, Inicio, Fin), foco atrapado y devuelto en confirmaciones, enlace para
  saltar al contenido, anillo de foco, movimiento reducido y contrastes AA
  comprobados por prueba. Las pruebas son de cadena y DOM simulado; no se usó un
  lector de pantalla.
- Ejecuta las pruebas con `node --test` desde la raíz. Necesitas Node 18 o
  superior, sin dependencias.

## Conectar el backend

### Backend publicado (configuración por defecto)

`platform/providers/config.js` apunta al backend desplegado en Azure:

```js
Sereno.providers.config = {
  baseUrl: "https://sereno-phishing.chilecentral.cloudapp.azure.com",
  timeoutMs: 4000
};
```

Lo sirve Caddy, con un certificado de Let's Encrypt, delante de Flask. El
manifest concede ese origen en `host_permissions`, así que basta con cargar la
extensión. En este modo el backend emite la cookie de sesión `Secure; HttpOnly;
SameSite=None` (sin `AUTH_LOCAL_HTTP`). Chrome trata como same-site las
peticiones de la extensión a un origen con permiso de host, pero su
documentación indica que ese trato no aplica si el navegador bloquea las cookies
de terceros (incógnito lo hace por defecto); en ese caso la sesión podría no
mantenerse. El comportamiento en Chrome real contra este backend está sin
verificar.

### Inicio rápido: backend local

1. From the sibling `sereno-backend/`, run its launcher:

   ```powershell
   .\start.ps1
   ```

   It starts the PostgreSQL and Redis containers (`docker compose up -d --wait`,
   so Docker Desktop must be running) and serves the backend on
   `127.0.0.1:5000` for loopback development. Use throwaway accounts only. The
   backend README covers the environment setup, the settings and the storage.
   Do not expose this server publicly.

2. En `platform/providers/config.js`, cambia `baseUrl` al backend local. No
   hace falta tocar otro archivo: el manifest ya concede `http://127.0.0.1:5000/*`.

   ```js
   Sereno.providers.config = {
     baseUrl: "http://127.0.0.1:5000",
     timeoutMs: 4000
   };
   ```

   Devuelve la dirección publicada antes de hacer commit:
   `tests/providers.test.js` y `tests/auth-remote-composition.test.js` exigen
   esa dirección por defecto.

   Los cuatro puertos (`verdict`, `auth`, `data` y `survey`) usan el adaptador
   remoto contra `baseUrl`; no hay otro adaptador ni fallback. El backend
   implementa todas las rutas del [Contrato REST](#contrato-rest). Ante un error
   de API la protección queda degradada y los datos muestran su error.
   Submitted passwords go only to the auth port, not local storage.
   A successful session check adopts the server identity, replacing stale local
   admin flags/tokens. An unreachable backend keeps the previous session
   as unverified; logout clears local session even if server revocation fails.

3. Load/reload the unpacked extension in `chrome://extensions`. Its manifest
   grants `http://127.0.0.1:5000/*` besides the published origin. Register a
   new account, close/reopen the popup, log out, and log in again. Backend
   accounts are created only by registration; newly registered users have `isAdmin: false`. To promote
   a throwaway account, follow the sibling
   [`sereno-backend/README.md`](../sereno-backend/README.md): its development tools
   page changes a user's role, and the stored role is `user` or `admin` (never a Spanish value). Existing
   server sessions reload the current role (exposed as `isAdmin`) on each request, so promotion or demotion
   takes effect without logging in again. El caché y las métricas son solo para
   administradores. El historial es de la cuenta con sesión; sin sesión el popup
   no muestra historial. Las respuestas SUS se guardan en el backend sin la cuenta y la
   participación se registra por separado para impedir envíos repetidos. El estado
   local conserva borradores por usuario, pero nunca decide si una cuenta puede participar.

4. Run `node --test` from this repository. Tres pruebas levantan el backend
   hermano en un puerto efímero de loopback y ejecutan el adaptador remoto real:
   `tests/auth-local-http.test.js` (autenticación y encuestas),
   `tests/admin-local-http.test.js` (denegación de usuario, promoción/democión
   manual, persistencia y fallos sin fallback de políticas) y
   `tests/verdict-local-http.test.js` (veredictos: legítimo, phishing con política
   de advertencia y de bloqueo, y acierto de caché; historial; caché; métricas de
   administrador y `forbidden` para usuario; versión del modelo y `cache_down`).
   Necesitan el entorno virtual del backend y sus contenedores de PostgreSQL y
   Redis: si faltan, informan un `skip` que pide ejecutar
   `docker compose up -d --wait` en `..\sereno-backend`. Cada archivo usa su
   propio almacenamiento (`tests/local-backend.js`): una base de datos
   `sereno_extension_test_<nombre>`, creada de cero al empezar y eliminada al
   terminar, y un índice de Redis propio (12, 13 y 14), vaciado antes y después.
   Nunca tocan los datos de desarrollo (base `sereno`, índice 0) ni los de la
   suite del backend (`sereno_test`, índice 15). El resto de las pruebas del adaptador
   remoto usa `tests/rest-fake.js`, un backend falso solo de pruebas que responde
   el contrato REST con las mismas reglas de sesión y de administrador.

### Cookie boundary and other configurations

The local backend flag explicitly selects host-only, HttpOnly, SameSite=Lax
cookies without Secure. It rejects non-loopback literal hosts/peers and forwarded
headers before auth operations. Do not use this mode behind a proxy. Unset
`AUTH_LOCAL_HTTP` for the unchanged Secure/SameSite=None backend defaults.

Requests from extension pages/service workers use `credentials: "include"`.
Chrome host permissions permit privileged cross-origin fetch and treat these
requests as same-site, subject to browser cookie settings. No CORS headers or
`cookies` API access are added; content scripts do not issue auth requests.
Real Chrome acceptance, restoration and logout still need manual verification.
See [network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests),
[cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies),
and [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).

Para apuntar a otro backend remoto, usa HTTPS de confianza y cambia `baseUrl`
y su entrada de `host_permissions` a la vez; la prueba del manifest solo admite
HTTP para la configuración local documentada. Production hardening remains
out of scope, including session expiry, rate limits and CSRF protection.

### Contrato REST

Todas las rutas cuelgan de `baseUrl`. Cuerpos JSON, con `credentials: "include"`.
Un 2xx devuelve exactamente el resultado del puerto sin `ok` (el adaptador lo
añade).

| Método | Ruta | Petición | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| POST | `/v1/verdict` | `{ url }` | `{ domain, verdict, policy, score, source, latencyMs }` | 400 `invalid`, 500 `server` (si el caché falla, responde el modelo) |
| POST | `/v1/auth/login` | `{ username, password }` | `{ user, token }` | 401 `{ error: "invalid" }` |
| POST | `/v1/auth/register` | `{ username, password }` | `{ user, token }` | 409 `duplicate`, 400 `invalid` |
| POST | `/v1/auth/logout` | `{}` | `{}` | |
| GET | `/v1/auth/session` | | `{ session }` (`null` sin sesión) | |
| GET | `/v1/history` | | `{ entries }` | 401 `invalid`, 500 `server` |
| DELETE | `/v1/history` | | `{}` | 401 `invalid`, 500 `server` |
| GET | `/v1/domains` | | `{ domains }` | 401 `invalid`, 403 `forbidden`, 500 `server` |
| PUT | `/v1/domains` | `{ domains }` | `{ domains }` | 400 `invalid`, 401 `invalid`, 403 `forbidden`, 500 `server` |
| GET | `/v1/cache` | | `{ cache }` | 401 `invalid`, 403 `forbidden`, 503 `cache_down` |
| PUT | `/v1/cache/ttl` | `{ ttlPhishingDays, ttlLegitHours }` | `{ cache }` | 400 `invalid`, 401 `invalid`, 403 `forbidden`, 503 `cache_down` |
| POST | `/v1/cache/invalidations` | `{ domain }` | `{ cache }` | 400 `invalid`, 401 `invalid`, 403 `forbidden`, 503 `cache_down` |
| GET | `/v1/metrics` | | `{ metrics }` | 401 `invalid`, 403 `forbidden`, 500 `server` |
| GET | `/v1/model` | | `{ version }` | |
| GET | `/v1/survey` | | `{ submitted: boolean }` | 401 `invalid`, 500 `server` |
| POST | `/v1/survey` | `{ answers }` | `{}` | 409 `already_submitted`, 400 `invalid`, 401 `invalid`, 500 `server` |

Formas:

- `verdict`: la clase del modelo, `"phishing"` o `"legitima"`. `policy`: la política del
  dominio, `"advertencia"` o `"bloqueo"`, siempre presente (`"advertencia"` si el dominio no
  está en la lista). `source`: `"cache"` o `"modelo"`.
- El backend no decide qué ve el usuario: la extensión aplica la política. `legitima` se
  muestra como «seguro»; `phishing`, como la política (`advertencia` o `bloqueo`). Cualquier
  otro valor se trata como error `server` (protección degradada), nunca como veredicto.
- `user`: `{ username, isAdmin, createdAt }`, con `isAdmin` booleano (la etiqueta del rol se traduce en el front).
  Nunca lleva la contraseña. `token` es opaco.
- `session`: `{ username, isAdmin, loginAt, token? }`.
- `entries`: `[{ id, domain, verdict, policy, score, source, ts, latencyMs }]`, del usuario con
  sesión; `policy` es la que regía cuando se sirvió. La extensión aplica la misma regla a
  cada elemento y descarta los que no la cumplen.
- `domains`: `[{ domain, policy, updatedAt }]` con `policy` `"advertencia"` o `"bloqueo"`.
  `PUT` reemplaza la lista completa.
- `cache`: `{ ttlPhishingDays, ttlLegitHours, invalidations: [{ domain, verdict, date }] }`.
  `verdict` es la clase del modelo con la que se reevaluó el dominio, o `null` mientras la
  reevaluación está pendiente. Varias entradas pueden compartir dominio. Aquí no se aplica
  política: el caché guarda lo que dijo el modelo.
- `version` (`GET /v1/model`): la versión del modelo cargado.
- `metrics`: la forma del panel, `{ analyzed, deltaPct, phishingPct, phishingCount,
  latencyMs, latencyTargetMs, cacheHitPct, sparklines, hourly, queries }`.
- `answers`: diez valores enteros de la escala SUS (1–5). El servidor obtiene la cuenta de la sesión; el cliente no envía el usuario.
- `submitted`: indica si la cuenta autenticada ya participó. La participación se almacena separada de las respuestas.
- `POST /v1/verdict` también registra la visita en el historial del usuario con
  sesión: el cliente nunca escribe el historial.

Errores: un cuerpo no 2xx `{ error }` con un código conocido se pasa tal cual
(`invalid`, `duplicate`, `cache_down`, `timeout`, `offline`, `server`). En las
rutas solo para administradores (políticas, caché y métricas) también se conserva
`forbidden`, con un mensaje específico para permisos de administrador; las rutas
de autenticación, historial y encuesta mantienen su mapeo existente. Un 401
`invalid` del historial significa que no hay sesión en el backend: el caso de uso
lo muestra como historial vacío y no como error. En el POST de encuesta también se conserva `already_submitted`;
no se interpreta así ningún 409 de otros endpoints. Un 504 es
`timeout`; cualquier otro fallo es `server`. Sin red es `offline`. Si no hay
respuesta en `timeoutMs`, el adaptador aborta la petición y devuelve `timeout`.

### Puertos

Cada método es asíncrono y no lanza. Devuelve `{ ok: true, ... }` o
`{ ok: false, error }`, con `error` en `timeout | offline | server | cache_down`
(transporte) o `invalid | duplicate | forbidden` (dominio). Definidos en
`platform/providers/ports.js`.

| Puerto | Método |
| --- | --- |
| `verdict` | `evaluate(url)` |
| `auth` | `login(username, password)`, `register(username, password)`, `logout()`, `session()` |
| `data` | `listHistory()`, `deleteHistory()`, `getDomainPolicies()`, `putDomainPolicies(domains)`, `getCache()`, `setCacheTtl(phishingDays, legitHours)`, `invalidateCache(domain)`, `getMetrics()`, `getModelVersion()` |
| `survey` | `status()`, `submit(answers)` |

La raíz de composición (`platform/providers/index.js`) construye los cuatro
puertos sobre el adaptador remoto.

### Regla fail-open

Una protección degradada **nunca bloquea**. Solo un veredicto `bloqueo` real
(phishing en un dominio con política de bloqueo) detiene la navegación. Si el backend, la red o el caché fallan, la página carga,
el badge muestra `?`, el popup indica «Protección degradada» y la página muestra
un aviso. Bloquear durante una caída dejaría sin acceso a sitios legítimos cada
vez que el servicio falle. La decisión está en `verdict/domain/outcome.js`.

Dos plazos: el adaptador remoto corta a los `timeoutMs` (4 s por defecto) y el
caso de uso tiene su propio límite de 6 s. «Evaluando…» aparece solo si la espera
pasa de 300 ms.

### Verificación manual en Chrome

La extensión se cargó en Chrome real en dos revisiones previas (una del popup y
una sesión de QA manual), cuyos hallazgos están corregidos y registrados en
`odd/tasks/front-backend-ready.md` (T9) y `odd/tasks/qa-findings.md`. La lista
se ejecutó después en Chrome 157, con la extensión descomprimida y los tres
contenedores en ejecución: los diez puntos marcados resultaron aprobados. Los
puntos sin marcar siguen pendientes; la sesión, la encuesta y los datos con el
backend se cubren con las pruebas automáticas de integración. Para repetirla,
cárgala descomprimida, abre las DevTools del service worker
(`chrome://extensions` → «service worker») y revisa:

- [x] Carga sin errores ni avisos en `chrome://extensions`; el nombre, la
      descripción y la versión salen como en el manifest.
- [x] Badge en una pestaña real: `✓`, `!`, `✕`, `…` y `?` según el caso, y cada
      pestaña conserva el suyo al cambiar entre ellas.
- [x] Modal en una página real: advertencia (se cierra con Esc, «Volver»,
      «Continuar bajo riesgo», «Ver detalle») y bloqueo (sin Esc, sin continuar).
- [x] Consola de una página real (por ejemplo, youtube.com) sin el error «Unsafe
      attempt to load URL chrome-extension://…», y en una página con veredicto de
      advertencia y en otra de bloqueo, el modal con estilos y con sus íconos.
- [x] Un sitio con CSP estricta (por ejemplo, con `style-src` e `img-src`
      restringidos): el modal conserva estilos (hoja construida) e íconos (SVG en
      línea). Si falta el estilo, el navegador no admitió la hoja construida y cayó
      al `<style>`, que esa CSP puede bloquear.
- [x] Cambio de política: con una advertencia en pantalla, cambiar el dominio a
      `bloqueo` en el panel y recargar la misma pestaña; debe salir el bloqueo,
      también si antes se eligió «Continuar bajo riesgo». Una sola petición a
      `/v1/verdict` por recarga y sin parpadeo del modal. Probar también con una
      página que carga más rápido de lo que responde el backend y recargando
      antes de 10 s: la recarga siempre vuelve a consultar.
- [x] Navegación en una SPA (`pushState`) y cambio de `#fragmento`: Chrome
      informa un `loading` con la URL nueva y un `complete` uno o dos
      milisegundos después, así que cada ruta nueva se evalúa una vez (una sola
      petición a `/v1/verdict`). Confirmar que no salen dos peticiones.
- [x] Foco e `inert`: el foco entra al diálogo, no sale con Tab, vuelve al cerrar
      y el fondo no responde.
- [ ] Teclado en el popup (pestañas con flechas, menú de cuenta, confirmación de
      borrado) y en el panel (enlace para saltar).
- [x] Reinicio del service worker: detenerlo desde `chrome://serviceworker-internals`
      o esperar a que se duerma, navegar y comprobar que el badge, el modal y
      «Continuar bajo riesgo» siguen funcionando con el estado guardado.
- [x] La fuente: Inter no se aplica en el aviso en página (el empaquetado descarta
      `@font-face`), así que el modal usa la fuente sans-serif del sistema.
- [ ] Un lector de pantalla recorre el modal, los estados de carga y el popup.
- [ ] Backend local: confirmar el permiso de host, la cookie HttpOnly/Lax, registro,
      login, restauración al cerrar y abrir el popup, logout/revocación y envío SUS
      repetido en Chrome real. Sin sesión y ante errores de red/400/401/500, la
      encuesta debe consultar el estado remoto antes de mostrar preguntas, impedir un
      segundo envío y mostrar el fallo sin fingir éxito. La confirmación no debe exponer
      el puntaje SUS. Los borradores no deben aparecer al cambiar de cuenta.
- [ ] Backend local, datos: con el backend encendido, el badge y el modal siguen
      el veredicto del backend; la segunda visita llega con
      `source: "cache"`. El historial del popup lista las visitas de la cuenta con
      sesión y se borra; el panel muestra caché (TTL, invalidación) y métricas para
      un administrador. Con el backend apagado, la protección queda degradada (`?`)
      sin bloquear.
- [ ] With a future HTTPS backend, verify Secure/None cookies and remote verdict
      failures (offline, timeout, 500, cache outage) degrade without blocking.

## Skills obligatorios

Antes de crear, modificar o depurar cualquier parte de la extensión (manifest,
service worker, content scripts, popup, permisos o publicación), se debe usar
el skill `chrome-extensions` (GoogleChrome/modern-web-guidance). Está en
`.agents/skills/chrome-extensions` y en `.claude/skills/`. Para HTML, CSS y JS
del lado del cliente, usa también `modern-web-guidance`.

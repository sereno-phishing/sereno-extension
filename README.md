# Sereno — Prototipo funcional (Sprint 1)

Extensión de Chrome (Manifest V3) sin backend que replica las vistas reales de
Sereno, la extensión anti-phishing. Incluye el popup completo, el panel de
administración, la política de privacidad y una tienda de demo donde se ven los
avisos en página.

## Qué es

Prototipo funcional sin backend del Sprint 1: replica las vistas reales de la
extensión y permite recorrer los flujos con datos simulados. Todo el estado vive
en `chrome.storage.local`, así que el popup, el panel de administración y la
tienda de demo comparten la misma información: lo que simulas en la tienda se ve
en el resto de la extensión.

Los datos son de ejemplo (usuarios, historial, dominios, caché, métricas y
encuesta SUS). No hay servidor, no hay modelo real y no se envía nada a internet.

## Requisitos

- Google Chrome 88 o superior (Manifest V3). También funciona en navegadores
  basados en Chromium (Edge, Brave, Opera).
- No requiere Node.js, servidor ni conexión a internet.
- No hay dependencias ni paso de compilación: la carpeta se carga tal cual.

## Instalación

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta `sereno-extension`.
5. (Opcional) Abre el menú de extensiones y fija Sereno en la barra para ver el
   ícono y el badge.

## Cómo probar la demo

1. **Primer uso.** Abre el popup de Sereno: verás el onboarding de 3 pasos
   (qué hace, qué permiso necesita y cómo leer una alerta). Pulsa **Empezar**.
2. **Inicia sesión** con una de las cuentas demo (contraseña `sereno123` para
   ambas), o crea una cuenta nueva si prefieres ver el historial vacío:
   - `andres.torres` — rol **usuario**: historial con datos, pestañas Inicio/Historial.
   - `admin.sereno` — rol **administrador**: tarjeta de administración y acceso al panel.
3. **Abre la tienda de demo** desde el panel de administración (botón
   **Abrir tienda de demo**, abajo a la izquierda) o directamente en
   `chrome-extension://<ID>/app/demo-store/store.html`, reemplazando `<ID>` por el ID de
   la extensión que muestra `chrome://extensions`.
4. **Prueba los 4 escenarios** del simulador (esquina inferior izquierda):
   - **Sitio seguro**: badge verde `✓` y tooltip «Sereno: sitio seguro».
   - **Advertencia**: modal ámbar con la opción de **Ver detalle** o
     **Continuar bajo riesgo**.
   - **Bloqueo**: modal rojo sin opción de continuar.
   - **Pendiente**: toast «Evaluación pendiente».
   Cada escenario pasa por un estado «Evaluando…» de ~0.7 s antes del veredicto.
5. **Vuelve al popup**: el estado del sitio y el historial reflejan la navegación
   que simulaste, y el panel de administración refleja la operación (métricas,
   dominios y caché). Con `andres.torres` ves la experiencia de usuario (tarjeta
   «Este sitio», pestañas Inicio/Historial); con `admin.sereno` ves la tarjeta de
   administración que abre el panel.

Para empezar de cero, borra el historial desde el propio popup o quita y vuelve
a cargar la extensión en `chrome://extensions` (se restauran los datos semilla).

## Mapa de vistas ↔ HU

| Vista o flujo | HU | Dónde se ve |
| --- | --- | --- |
| Cargar Sereno en Chrome | HU-01 | `manifest.json`, `chrome://extensions` |
| Onboarding de 3 pasos | HU-03 | Popup, primera apertura |
| Sitio seguro | HU-04 | Popup (estado), tooltip de la tienda de demo |
| Advertencia | HU-05 | Modal ámbar de la tienda de demo |
| Crear cuenta | HU-13 | Popup → Crear cuenta |
| Iniciar sesión | HU-14 | Popup → Iniciar sesión |
| Cerrar sesión | HU-15 | Popup → menú de cuenta → Cerrar sesión |
| Historial | HU-17 | Popup → pestaña Historial |
| Filtrar historial | HU-18 | Popup → Historial → chips de filtro |
| Borrar historial | HU-19 | Popup → Historial → Borrar historial |
| Detalle del veredicto | HU-20 | Popup → detalle del historial y «Ver detalle» del aviso |
| Política por dominio | HU-21 | Panel de administración → Política por dominio |
| Bloqueo | HU-22 | Modal rojo de la tienda de demo |
| Política de privacidad | HU-23 | `app/privacy/privacy.html`, enlace del pie del popup |
| Estado de la protección | HU-24 | Popup → tarjeta «Protección activa» y estado del sitio |
| Evaluación pendiente | HU-25 | Toast de la tienda de demo y estado «Evaluando…» |
| Versión del modelo | HU-27 | Pie del popup y aviso «Modelo actualizado» |
| Caché | HU-28 | Panel de administración → Caché |
| Métricas de operación | HU-29 | Panel de administración → Métricas |
| Encuesta SUS | HU-32 | Popup → menú de cuenta → Encuesta de opinión |

## Estructura del proyecto

Las carpetas de primer nivel nombran el negocio (arquitectura que «grita» el
dominio). Cada dominio se divide en `domain/` (reglas puras), `application/`
(casos de uso que reciben el store como puerto) y `ui/` (vistas
presentacionales que reciben datos y devuelven HTML). Las páginas viven en
`app/`, y los bordes técnicos en `platform/` y `ui/`.

```
sereno-extension/
├── manifest.json                 # MV3: popup, options_page, iconos y permisos
├── app/                          # Raíces de composición: una carpeta por página
│   ├── popup/                    # popup.html/.css, popup-views.js (plantilla), popup-page.js (contenedor)
│   ├── admin/                    # admin.html/.css, admin-views.js (plantilla), admin-page.js (contenedor)
│   ├── demo-store/               # store.html/.css, store-page.js (contenedor del simulador)
│   └── privacy/                  # privacy.html/.css (página estática)
├── verdict/                      # Catálogo de estados, nivel de riesgo, fuente; pills y badge
├── account/                      # Usuarios, login, registro, roles; formularios y menú de cuenta
├── history/                      # Historial: deduplicación 60 s, tope 200, filtros; lista y detalle
├── survey/                       # Encuesta SUS: preguntas y puntaje; vistas de la encuesta
├── onboarding/                   # Recorrido de 3 pasos
├── protection/                   # Sitio actual, versión del modelo y aviso; tarjetas del inicio
├── administration/               # Política por dominio y caché (reglas, casos de uso, secciones del panel)
├── demo-store/                   # Escenarios del simulador y modal de veredicto en página
├── time/                         # Fechas y sellos de tiempo (funciones puras)
├── platform/                     # Bordes técnicos
│   ├── storage.js                # Puerto de almacenamiento: chrome.storage, localStorage o memoria
│   ├── state-store.js            # Store reactivo compartido entre páginas (cola, sync externo)
│   ├── browser.js                # Abrir páginas de la extensión y pintar el badge por pestaña
│   ├── preferences.js            # Preferencias de UI del popup (pestaña recordada)
│   └── seed.js                   # Datos semilla: usuarios, historial, dominios, caché, métricas
├── ui/                           # Sistema de diseño
│   ├── tokens.css                # Design tokens y clases base
│   ├── atoms.js                  # Átomos: esc, imagen/ícono, botón, chip, pill, input, banner
│   ├── molecules.js              # Moléculas: campo con etiqueta, ítem de leyenda, tarjeta con tabla
│   └── dom.js                    # Arranque de página y delegación de clics (data-action)
├── tests/                        # Pruebas con node:test sobre los dominios, casos de uso y átomos
├── assets/                       # Logo, íconos SVG y fuente Inter
└── icons/                        # icon16, icon32, icon48, icon128
```

## Notas técnicas

- **Manifest V3** sin service worker a propósito: el prototipo no intercepta
  navegación real; la tienda de demo simula la operación.
- **Scripts clásicos, sin compilación**: cada archivo es una IIFE que se
  registra en un único espacio de nombres `globalThis.Sereno` (por ejemplo
  `Sereno.history` o `Sereno.verdictUi`). Cada página los carga con etiquetas
  `<script>` en orden: plataforma, dominios, casos de uso, átomos, vistas y por
  último el contenedor. Funciona igual dentro de la extensión y abriendo las
  páginas con `file://`.
- **Regla de dependencias**: los archivos `*/domain/*` son puros (sin `window`,
  `document`, `chrome` ni `localStorage`); los casos de uso reciben el store como
  parámetro; solo `platform/` toca `chrome.*` y `localStorage`; las vistas
  reciben datos y devuelven HTML, sin acceso al store ni eventos; los
  contenedores (`app/*/*-page.js`) tienen el estado de la página, la delegación
  de eventos y la suscripción al store.
- **Persistencia**: `chrome.storage.local` bajo la clave `sereno.state.v1`. El
  store también acepta `localStorage` o memoria para poder probarse en Node.
- **Permisos**: solo `storage` y `tabs`. El badge por pestaña se pinta con
  `chrome.action.setBadgeText` / `setBadgeBackgroundColor` usando el `tabId` de
  `chrome.tabs.getCurrent()`.
- **CSP**: scripts clásicos externos, sin `onclick` en el HTML, sin CDNs, sin
  fuentes ni imágenes remotas.
- **Datos simulados**: usuarios, historial, reglas por dominio, caché y métricas
  viven en `platform/seed.js`; ningún archivo de dominio depende de ellos. El
  botón **Abrir tienda de demo** del panel de administración abre
  `app/demo-store/store.html`.
- **Estado compartido**: la tienda de demo escribe `currentSite` e historial en el
  mismo store que lee el popup, por eso los tres frentes quedan sincronizados.
- **Pruebas**: `node --test` desde la raíz (Node 18 o superior, sin
  dependencias).

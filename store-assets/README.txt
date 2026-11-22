Sereno 0.3.0 - Chrome Web Store images
=======================================

All files: PNG, 8-bit RGB (color type 2), no alpha channel, no tRNS.

SCREENSHOTS (1280x800)

1. screenshot-1-sitio-seguro.png (1280x800, 329 KB)
   Eyebrow:  VEREDICTO AL INSTANTE
   Title:    Conoce si un sitio es seguro antes de ingresar tus datos
   Subtitle: Sereno evalúa cada página que abres y muestra el resultado en el ícono y en la ventana de la extensión.
   UI:       popup home, signed out, current site wikipedia.org = Seguro.

2. screenshot-2-advertencia-phishing.png (1280x800, 223 KB)
   Eyebrow:  AVISO EN LA PÁGINA
   Title:    Te avisa cuando un sitio puede ser phishing
   Subtitle: Si detecta señales de phishing en la dirección, puedes volver o continuar bajo tu propio riesgo.
   UI:       in-page warning dialog (content script) on login-actualiza-datos.test, score 0.93, policy "advertencia".

3. screenshot-3-historial.png (1280x800, 352 KB)
   Eyebrow:  HISTORIAL
   Title:    Revisa los sitios que Sereno evaluó
   Subtitle: Filtra tus consultas por resultado (seguro, advertencia o bloqueado) y abre el detalle de cada una.
   UI:       popup History tab with filter chips and 6 visible entries.

4. screenshot-4-inicio-sesion.png (1280x800, 308 KB)
   Eyebrow:  TU CUENTA
   Title:    Inicia sesión para guardar tu historial
   Subtitle: Con una cuenta, los sitios que Sereno evalúa quedan guardados para que los revises cuando quieras.
   UI:       popup sign-in form (usuario.demo, masked password).

5. screenshot-5-idioma.png (1280x800, 307 KB)
   Eyebrow:  IDIOMA
   Title:    En español o en inglés
   Subtitle: Cambia entre español e inglés desde el menú de tu cuenta. La ventana y los avisos en la página siguen tu elección.
   UI:       popup account menu open (language selector Español / English).

PROMO TILES

6. promo-small-440x280.png (440x280, 80 KB)
   Text: Sereno - Te avisa del phishing antes de que ingreses tus datos.

7. promo-marquee-1400x560.png (1400x560, 314 KB)
   Text: Sereno - Te avisa del phishing antes de que ingreses tus datos.
         Extensión para Chrome · Español e inglés
   UI:   popup home (same capture as screenshot 1).

HOW THEY WERE MADE

- Real extension UI (app/popup/popup.html and the content-script warning
  dialog) rendered in headless Chrome at device scale 2, Spanish locale,
  reduced motion; then placed on a branded background (sereno-landing dark
  palette, Inter font bundled with the extension, landing logo).
- Data stubbed, no network: backend calls were answered by the repo's own
  test fake (tests/rest-fake.js) with demo data; every request outside
  127.0.0.1 was aborted. Phishing examples use reserved TLDs (.test, .example).
- Sources: ../tool/capture.js (raw UI captures into ../raw), ../tool/compose.js
  (layout), ../stage/ (neutral host page for the warning, logo).

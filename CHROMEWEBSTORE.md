# Chrome Web Store listing: Sereno

> Last updated: 2026-11-22 · Version 0.3.0 · Package: `node scripts/store-package.js` -> `dist/sereno-0.3.0.zip`

Everything the owner pastes into the Chrome Web Store Developer Dashboard. Each statement below was checked against the code of this repository and the published privacy policy. The store copy is plain text on purpose: the store strips Markdown, so paste the content of the code blocks as is.

## Package

Build the upload from a clean working tree:

```
node scripts/store-package.js
```

The script writes `dist/sereno-<version>.zip` (`dist/` is ignored by git). It needs Node 18 or later and nothing else: the zip is written by the script itself with Node's built-in `zlib`, so it does not depend on `zip` or on which `tar` comes first in `PATH`, and the same sources always give the same bytes. On Windows you can inspect the result with the system `tar.exe -tf dist\sereno-0.3.0.zip`.

What it does:

- Packages `manifest.json` without `http://127.0.0.1:5000/*` in `host_permissions`. Every other field is identical. The repository manifest keeps that entry for local development.
- Packages only what the extension loads: the files named by the manifest (service worker, content scripts, popup, options page, icons, default locale), the scripts and stylesheets each page links, the service worker's `importScripts` list, the files the stylesheets point to with `url()`, and the `assets/`, `icons/` and `_locales/` folders. It leaves out `tests/`, `odd/`, `scripts/`, `tools/`, agent folders, dotfiles, Markdown and the two stylesheets that only feed `content/content-assets.generated.js`.
- Stops with an error if a referenced file is missing, if a development file slipped in, or if a packaged file still names the loopback backend (for example, `platform/providers/config.js` left on `http://127.0.0.1:5000`).

Build of 2026-11-22: `dist/sereno-0.3.0.zip`, 196,722 bytes, 84 files.

The store rejects an upload whose version is not higher than the published one: bump `version` in `manifest.json` before each new upload.

## Store listing tab

**Extension name** (from the manifest, must match): `Sereno`

**Primary language:** Spanish (the manifest's `default_locale` is `es`). The package also ships `_locales/en`, so add an English listing as a second language.

**Category** (suggested): Privacy & Security. If the dashboard does not offer it, use Tools.

### Spanish (primary)

Short description (119 characters, the same text Chrome shows from `_locales/es`):

```
Detecta sitios de phishing mientras navegas y te avisa antes de que ingreses tus datos en tiendas y servicios en línea.
```

Detailed description:

```
Sereno revisa cada página web que abres y te avisa si puede ser un sitio de phishing, antes de que escribas tus datos.

QUÉ HACE
• Evalúa cada página http y https que visitas con el servicio de detección de Sereno.
• Muestra el resultado en el ícono de la barra: ✓ seguro, ! advertencia, ✕ bloqueo, … evaluando y ? protección degradada.
• Si el sitio parece de phishing, abre un aviso dentro de la página. En una advertencia puedes volver atrás, ver el detalle o continuar bajo tu propio riesgo. En un bloqueo no se ofrece continuar.
• En la ventana de Sereno ves el estado del sitio actual y si la protección está activa.
• Con una cuenta opcional, guardas el historial de los sitios evaluados, lo filtras por resultado y lo borras cuando quieras.
• Disponible en español e inglés.
• Si el servicio no responde, Sereno no bloquea nada: la página carga y verás el aviso «Protección degradada».

CÓMO USARLA
1. Instala Sereno y fíjala en la barra de extensiones.
2. Abre la ventana de Sereno y sigue la presentación de tres pasos.
3. Navega como siempre. El ícono cambia en cada página y, si hay riesgo, aparece un aviso.
4. Si quieres historial, crea una cuenta desde la ventana de Sereno. No pedimos correo.

PRIVACIDAD
Para evaluar un sitio, Sereno envía la dirección de la pestaña actual al servidor de Sereno por una conexión cifrada (HTTPS). El servidor guarda solo el hash y el dominio de cada dirección; la dirección completa no se conserva. Sereno no lee el contenido de las páginas. Si creas una cuenta, guardamos tu usuario y el hash de tu contraseña, y tus consultas quedan vinculadas a ella para mostrarte tu historial. No vendemos tus datos ni los compartimos. Política completa: https://sereno-phishing.github.io/sereno-landing/privacy.html

PERMISOS
• Leer tu historial de navegación: Sereno necesita la dirección de cada pestaña para evaluarla.
• Leer y cambiar tus datos en los sitios web: solo para mostrar el aviso dentro de la página. Sereno no lee ni guarda lo que contiene la página.

SOPORTE
Escríbenos a u202220528@upc.edu.pe.

Sereno forma parte de un proyecto de tesis de Ingeniería de Software de la Universidad Peruana de Ciencias Aplicadas (UPC).
```

### English

Short description (110 characters, the same text Chrome shows from `_locales/en`):

```
Detects phishing sites as you browse and warns you before you enter information in online stores and services.
```

Detailed description:

```
Sereno checks every web page you open and warns you if it may be a phishing site, before you type in your information.

WHAT IT DOES
• Evaluates every http and https page you visit with the Sereno detection service.
• Shows the result on the toolbar icon: ✓ safe, ! warning, ✕ blocked, … evaluating and ? degraded protection.
• If the site looks like phishing, it opens a notice inside the page. On a warning you can go back, see the details or continue at your own risk. On a block there is no option to continue.
• The Sereno window shows the status of the current site and whether protection is active.
• With an optional account, you keep a history of evaluated sites, filter it by result and delete it whenever you want.
• Available in Spanish and English.
• If the service does not respond, Sereno blocks nothing: the page loads and you see a "Degraded protection" notice.

HOW TO USE IT
1. Install Sereno and pin it to the extensions toolbar.
2. Open the Sereno window and follow the three-step introduction.
3. Browse as usual. The icon changes on each page and, if there is a risk, a notice appears.
4. If you want a history, create an account from the Sereno window. No email address is required.

PRIVACY
To evaluate a site, Sereno sends the address of the current tab to the Sereno server over an encrypted connection (HTTPS). The server stores only the hash and the domain of each address; the full address is not retained. Sereno does not read page content. If you create an account, we store your username and a hash of your password, and your queries are linked to it to show you your history. We do not sell or share your data. Full policy: https://sereno-phishing.github.io/sereno-landing/privacy.html

PERMISSIONS
• Read your browsing history: Sereno needs the address of each tab to evaluate it.
• Read and change your data on websites: only to show the notice inside the page. Sereno does not read or store what the page contains.

SUPPORT
Write to u202220528@upc.edu.pe.

Sereno is part of a Software Engineering thesis project at Universidad Peruana de Ciencias Aplicadas (UPC), Peru.
```

Copy rules followed: no accuracy, speed or detection-rate figures (the code and README state none for the listing), no superlatives, no implementation details.

## Graphics

| Asset | Required size | Status | File |
|---|---|---|---|
| Store icon (required) | 128x128 PNG | Ready: checked 128x128, RGBA | `icons/icon128.png` |
| Screenshot 1 (required) | 1280x800 or 640x400 | Owner must create | |
| Screenshots 2 to 5 (recommended) | 1280x800 or 640x400 | Owner must create | |
| Small promo tile (recommended) | 440x280 PNG or JPEG | Owner must create | |
| Marquee promo tile (optional) | 1400x560 | Not needed for an unlisted item | |

No screenshots or promo images exist in the repository. Suggested screenshots, all at exactly 1280x800 (set the Chrome window to that size, or capture larger and crop; the popup alone is too small, so capture it over a page):

1. A warning: the amber in-page notice with "Volver", "Ver detalle" and "Continuar bajo riesgo", with the `!` badge visible.
2. A block: the red in-page notice without the option to continue, with the `✕` badge.
3. The popup on a safe site: "Este sitio" with the safe status and the green `✓` badge.
4. The popup History tab with the filter chips (signed in).
5. Optional: the popup in English, or the privacy view inside the popup.

Use a neutral test domain for the phishing examples. A screenshot that shows another company's name or logo (for example, a fake bank page) can be rejected as a trademark problem. The small promo tile can be the logo (`assets/logo.png`, 171x170) with the name "Sereno" and the short description on a plain background.

## Privacy practices tab

### Single purpose

```
Sereno warns users about phishing websites: it checks the address of each page they open with the Sereno detection service and shows the verdict on the toolbar icon, inside the page and in its popup.
```

Spanish version, if needed for internal records: «Sereno avisa al usuario sobre sitios de phishing: evalúa la dirección de cada página que abre con el servicio de detección de Sereno y muestra el veredicto en el ícono de la barra, dentro de la página y en su ventana emergente.»

The optional account, history, language selector, opinion survey and administrator panel all serve that purpose (history of verdicts, settings of the same detection) and are described as secondary features in the listing.

### Permission justifications

`storage`

```
Keeps Sereno's state on the device: the signed-in session (username, administrator flag and an opaque session token, never the password), the onboarding step, the language preference, the site currently shown in the popup, the remembered popup tab and unsent survey drafts (chrome.storage.local), plus the verdict of each open tab for the current browser session (chrome.storage.session), so the toolbar icon, the in-page notice and the popup stay consistent when the background worker restarts. Sereno does not use sync storage.
```

`tabs`

```
The background worker reads the URL of a tab when it navigates or becomes active, to request a verdict for that address and to paint the toolbar icon of that tab. It also opens Sereno's detail page in a new tab when the user clicks "See details" on a warning. Only the tab URL is read; titles and favicons are not used.
```

Host permission (the dashboard shows one field covering `host_permissions` and the content script matches):

```
https://sereno-phishing.chilecentral.cloudapp.azure.com/* is Sereno's own backend and the only server the extension contacts. It returns the verdict for the address being visited and serves the optional account (sign-in, registration, session), the user's verdict history, the model version, the opinion survey and the administrator settings.

The content script runs on http://*/* and https://*/* because a phishing page can be on any domain, and the warning has to appear on the page before the user types anything, without the user clicking the extension first. The content script only draws Sereno's notice (warning or block dialog, "evaluating" toast, "degraded protection" note) inside an isolated container on the page. It does not read, collect or modify the page's text, forms, links or cookies, and it makes no network requests. The only page data it uses is the page address, which it sends to Sereno's own background worker when the user chooses to continue past a warning or to see the details.
```

### Remote code

Answer: **No, I am not using remote code.**

Verified: every script ships in the zip and is loaded with `<script src>`, `importScripts` or the manifest; the extension pages declare `script-src 'self'; object-src 'self'`; there is no `eval`, `new Function`, dynamic `import()` or remote `<script>`; the in-page styles and icons are bundled in `content/content-assets.generated.js`; the backend only returns JSON data.

### Data usage

Check exactly these categories:

| Category | Check | What Sereno handles |
|---|---|---|
| Personally identifiable information | No | No name, email or ID number is requested. The account uses a username chosen by the user. |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | **Yes** | Username and password are sent over HTTPS to the Sereno backend to register or sign in (the server stores a password hash); the session token is kept in the extension's local storage. Only when the user creates an account. |
| Personal communications | No | |
| Location | No | |
| Web history | **Yes** | The address of every http/https page the user opens is sent to the Sereno backend to get a verdict. The server keeps a hash and the domain of each address; with an account, those queries are linked to it to show the history. |
| User activity | No | No clicks, keystrokes or scrolling are recorded. The optional SUS survey answers (ten values from 1 to 5) are stored without the account. |
| Website content | No | The content script does not read page content. |

Certifications (check all three):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

This matches the published policy: it states what is sent (the current tab's address, over HTTPS, only to evaluate it), what is stored (hash and domain), the account (username and password hash, queries linked for history, no email), the survey (answers without the account), hosting on Microsoft Azure as infrastructure provider only, no sale or sharing, retention and deletion. If the data practices change, update the policy, `privacy/ui/privacy-views.js` and this table together.

**Privacy policy URL:** `https://sereno-phishing.github.io/sereno-landing/privacy.html` (checked 2026-11-22: it loads and lists the ten sections above, dated 22 November 2026, with the contact email).

## Distribution tab

**Visibility (recommended): Unlisted.** Only people with the link can find and install it, which fits a thesis evaluation with invited participants, while still installing like any store extension (automatic updates, no developer mode). The review is the same as for a public item. It can be switched to Public later without a new upload. The owner decides in the dashboard.

**Regions:** All regions (with an unlisted item, only people who have the link see it).

**Pricing:** Free.

## Account and contact

| Field | Value |
|---|---|
| Publisher name | Owner decides (for example, the authors' names or "Sereno") |
| Contact email | `u202220528@upc.edu.pe` (must be verified in the dashboard and monitored) |
| Support email | `u202220528@upc.edu.pe` |
| Homepage URL | `https://sereno-phishing.github.io/sereno-landing/` (checked 2026-11-22: loads) |
| Privacy policy URL | `https://sereno-phishing.github.io/sereno-landing/privacy.html` |

## Test instructions for reviewers

Core functionality does not need an account: the service worker requests a verdict for every navigation whether or not someone is signed in, and the toolbar icon, the in-page notice and the "Este sitio" card work signed out. A reviewer can also create a regular account in the popup (registration is open and asks for no email).

The options page is the administrator panel. With no session or with a regular account it only shows "Sign in with an administrator account from the Sereno popup to view this panel", which a reviewer could read as a broken feature. Recommended: create a dedicated reviewer account, promote it to administrator as described in the backend README, and enter its username and password in the dashboard's **Test instructions** tab, with this note:

```
No account is needed for the main feature: browse any http/https page and look at the toolbar icon and the in-page notice. A warning or block appears only when the detection model classifies the visited address as phishing; the domain policy set in the administrator panel ("advertencia" or "bloqueo") decides which of the two is shown. The administrator panel (extension options) needs the administrator test account below; sign in from the Sereno popup first, then open the options page. The interface is in Spanish by default; switch to English from the account menu after signing in.
```

Do not reuse a personal account, and delete or demote the reviewer account after approval. The backend at `https://sereno-phishing.chilecentral.cloudapp.azure.com` must stay online during the review (it answered `GET /v1/model` with 200 on 2026-11-22): if it is down, every page shows "degraded protection" and the reviewer may report the extension as not working.

## Known review risks

- **Broad content script match (`http://*/*`, `https://*/*`).** Chrome shows "Read and change all your data on all websites" and the item gets an in-depth review, which can take longer. Mitigation: the host justification above explains why the notice must be on every domain before the user acts, and that the script draws only Sereno's notice and reads nothing from the page; the listing repeats it in plain language. Do not request `<all_urls>` or `activeTab`.
- **`tabs` permission.** Chrome shows "Read your browsing history". This is accurate (every address is sent for evaluation), so the data usage form must check **Web history**; leaving it unchecked is a disclosure mismatch.
- **Full addresses leave the device.** Query strings can contain personal data. The policy and listing say the full address is sent, processed in memory and not stored; keep the backend behaving like that.
- **Backend availability.** See the test instructions: an offline backend looks like a non-working extension.
- **Administrator panel behind a role.** Without the reviewer administrator account the options page is a gate.
- **Screenshots with third-party brands.** Use neutral test domains.
- **Session cookies.** The backend session cookie is `Secure; SameSite=None`. Chrome may not keep it if third-party cookies are blocked (Incognito by default). Verdicts are unaffected; sign-in persistence may be. Not a policy issue, but test it before submitting.

## Submission procedure

1. Register as a Chrome Web Store developer at `https://chrome.google.com/webstore/devconsole` with the Google account that will own the item (ideally one used only for publishing), accept the developer agreement and pay the one-time registration fee of USD 5 (confirm the amount shown in the dashboard).
2. In **Account**, set the publisher name, verify the contact email and complete the trader/non-trader declaration (an academic, non-commercial project).
3. Build the package: `node scripts/store-package.js` and keep `dist/sereno-0.3.0.zip`.
4. Click **New item** and upload the zip.
5. **Store listing:** Spanish description, short description, category, icon and screenshots from this file; then add English as a second language with its texts and the same or English screenshots. Homepage and support URL.
6. **Privacy practices:** single purpose, the three justifications, remote code "No", the data usage checkboxes and the three certifications, privacy policy URL.
7. **Distribution:** Unlisted, all regions, free.
8. **Test instructions:** reviewer administrator account and the note above.
9. Click **Submit for review**. Optionally choose to publish manually after approval (deferred publishing) so the link goes out when the thesis evaluation starts.
10. After approval, share the store link with the participants and record the date and status in the version history below. The store item gets a new extension ID; nothing in the extension or the backend depends on it.

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.3.0 | 2026-11-22 | First submission: verdicts from the published Azure backend, in-page warning and block, popup with history, account, SUS survey, Spanish and English, administrator panel. | Draft |

## Review notes

### Known issues and limitations

- The popup shows "Protección degradada" without its cause (offline, timeout, server or cache); the in-page notice shows it.
- Real Chrome behavior of the session cookie against the published backend is not yet verified (README, "Verificación manual en Chrome").

### Rejection history

None yet.

# Extension internationalization

Implement the approved language selector across the extension; keep SUS in Spanish.

## Specs

- S1: “i18n a la extension de una vez que esta pequena, ingles y espanol”
- S2: “guardar la preferencia del usuario y usar el idioma del navegador como valor inicial.”
- S3: “mantenga la encuesta SUS en español hasta verificar su versión en inglés” — “si”
- S4: “sin traducir dominios, datos del backend ni identificadores internos.”
- S5: “pero no me pongas el boton ahi pues, ponlo cuando le doy click al bagde de usuario o de admin”
- S6: “pero este diseno es feo todo tiene que estar integrado con el diseno”

## Tasks

- T1 [S1-S4] Catalog, shared preference, and selector; route worker; checks passed; commit: containing commit.
- T2 [S1-S4] Translate popup surfaces and preserve SUS; route worker; checks passed; commit: containing commit.
- T3 [S1-S4] Translate administration surface; route worker; checks passed; commit: containing commit.
- T4 [S1-S4] Translate remaining extension surfaces; route worker/inline; checks passed; commit: containing commit.
- T5 [S1-S6] Verify behavior, regression suite, and documentation; route inline/independent verifier; Chrome manual verification pending; commit: containing commit.
- T6 [S5-S6] Integrate the language selector into the account menu design; route worker; 97 focused and 459 local tests passed; commit: containing commit.

## Log

- L1: “deberiamos de poner de una vez el seletor de idioma ?? osea ponerle i18n a la extension de una vez que esta pequena, ingles y espanol”
- L2: “Si vamos con eso de una vez.”
- L3: “si” — SUS remains Spanish pending verification of its English version.
- L4: Independent verification found untranslated derived risk and source labels in the shared modal; corrected and covered by focused tests.
- L5: 454 local tests passed, generated content assets matched, and git diff --check passed. Two authorized isolated HTTP integration tests against the sibling backend passed. Chrome interaction and Chrome storage failure handling remain unverified.
- L6: “pero no me pongas el boton ahi pues, ponlo cuando le doy click al bagde de usuario o de admin”
- L7: “pero este diseno es feo todo tiene que estar integrado con el diseno”
- L8: Replaced the browser dropdown with styled radio choices. 459 local tests passed and content assets matched; visual and keyboard behavior in Chrome remain unverified.
- L9: User authorized including the existing open-tab navigation changes; committed separately as 100239f.

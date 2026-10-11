# Deutsche Admin-Oberfläche – lokale Verifikation

## Umfang

- Deutsch (`de`) ist eine unterstützte UI-Sprache. Ohne gültige explizite Query-/Cookie-Präferenz wird Deutsch verwendet; `Accept-Language` überschreibt diesen Standard nicht.
- Explizite Sprachwahl bleibt erhalten. Ein gültiges Request-Cookie hat bei der Hydrierung Vorrang vor veraltetem localStorage und einer abweichenden Kontopräferenz.
- Alle 16 Admin-Namespaces enthalten deutsche Ressourcen: **2.295 String-Schlüssel**, einschließlich Interpolation, Rich-Text-Tags und Pluralformen. Bundled Chrome und SSR-Ressourcen enthalten Deutsch; alle 40 lokalisierten öffentlichen Routen sind vorgerendert.
- Bestehende en/fr/es/sr-Übersetzungswerte wurden programmatisch mit dem Ausgangscommit verglichen: keine bestehenden Werte geändert. Zusätzliche Schlüssel betreffen Deutsch im Sprachmenü und bisher hartcodierte Konto-/Analyse-/Demo-/mobile Sidebar-Texte.
- Die KI-Rezeptionssprache (`RuntimeLocale`, Englisch/Französisch), Kunden-/Unternehmensdaten und Agentenkonfiguration wurden nicht umgestellt. Keine neue Migration, kein Push, kein Deployment.
- Englisch bleibt die technische Übersetzungs-Fallbacksprache. Die separate Marketingwebsite bleibt bei ihren vorhandenen Sprachen; deutsche Admin-Rechtslinks führen auf die vorhandene englische Marketingseite statt auf nicht vorhandene `/de`-Seiten.

## Tatsächlich ausgeführte Prüfungen

Nach den letzten Codeänderungen erfolgreich:

- `pnpm typecheck`
- `pnpm test`: **2.749 bestanden**, **184 übersprungen** (bestehende optionale/infrastrukturabhängige Tests).
- `pnpm build`, einschließlich Prerender-Prüfung für 40 öffentliche Locale-Routen.
- `pnpm lint`: keine Fehler, 19 Warnungen.
- `LOBBYSTACK_LOCALE_EVIDENCE_DIR=/root/lobbystack-german-evidence bash scripts/e2e-local.sh --skip-build -- e2e/german-default.e2e.ts`: **1 Chromium-End-to-End-Test bestanden**, mit realem isoliertem PostgreSQL/Redis/Mailpit und produktivem Standalone-Build. Testinfrastruktur anschließend entfernt.

Browser-/HTTP-Nachweis bei englischer Browsersprache:

- `/login` ohne Locale-Cookie: `/de/login`, `html lang="de"`, „Willkommen zurück“ in HTTP-HTML und nach Hydrierung.
- Explizites `?lng=en`: englischer Login, auch beim nächsten Aufruf durch persistiertes Cookie.
- Authentifizierter Onboarding-Einstieg ohne Locale-Cookie: deutsches SSR-HTML und deutsche sichtbare Formulartexte.
- Derselbe isolierte Testaccount mit explizitem englischem Cookie: englisches Onboarding trotz deutscher Kontopräferenz.

## RED → GREEN und Audit

Vor Umsetzung nachweislich fehlgeschlagen: deutscher Default, vollständige deutsche SSR-Ressourcen, explizites Cookie gegen stale storage/account sowie hartcodierte Konto-/Analyse-/mobile Sidebar-Texte. Zugehörige Regressionstests sind im Repository.

Ein TypeScript-AST-Audit der JSX-Textknoten in Admin-Komponenten und App-Routen findet nach der Bereinigung nur den Produktnamen `LobbyStack` und `&nbsp;`, keine hartcodierten englischen JSX-Fließtexte. Dies ist keine Behauptung, dass dynamische API-/Provider-Fehlermeldungen oder Kundendaten übersetzt werden: solche Inhalte behalten ihre ursprüngliche Sprache. Englischsprachige technische Fehlertexte und englische Fallbacks bei Netzwerkfehlern bleiben möglich.

Die deutsche Übersetzung ist maschinell erstellt und kontextbezogen redaktionell nachbearbeitet, insbesondere Navigation, Authentifizierung, Onboarding, Tarifnamen und gemeinsame Terminologie. Vollständige Schlüsselabdeckung ist geprüft; eine professionelle sprachliche Einzelabnahme aller Texte ist nicht erfolgt. Authentifizierte Dashboard-/Einstellungsflächen sind durch Ressourcen-/Unit-/Integrationstests abgedeckt, nicht jede davon wurde separat im Browser durchgeklickt.

## Belege

Dauerhafte lokale Belege: `/root/lobbystack-german-evidence/`

- `red.log`, `hardcoded-red.log`, `preference-red.log`, `sidebar-red.log`
- `green-final.log`, `preference-green.log`
- `typecheck-final.log`, `tests-final.log`, `build-final.log`, `lint-final.log`, `e2e-final.log`
- `coverage.json`, `hardcoded-jsx-audit.json`, `browser-verification.json`
- `login-http.html`, `onboarding-http.html`
- `login-de.png`, `login-en.png`, `onboarding-de.png`, `onboarding-en.png`

Ausgangscommit: `91a9c216cc34c9136b75638618a97b13024d32b7`.
Branch: `feat/german-default-ui`.

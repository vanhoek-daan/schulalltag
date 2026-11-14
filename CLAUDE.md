# CLAUDE.md – schulalltag

Web-App (PWA) für den Schulalltag von Daan van Hoek (Sekundarlehrer, Campus Glattal Zürich).
Spezifikation und Entscheide liegen im Obsidian-Vault: `06 Projekte/Schulalltag-App/`.

## Architektur
- Vite + Svelte 5 + TypeScript, Hosting auf GitHub Pages (`https://vanhoek-daan.github.io/schulalltag/`)
- Login mit MSAL.js (Entra ID, eigener Tenant), Daten über Microsoft Graph direkt im OneDrive
- **Der Vault ist die einzige Datenquelle.** Kein Server, keine Datenbank. Vault-Pfad und IDs in `src/config.ts`.
- Deploy: Push auf `main` → GitHub Actions (`.github/workflows/deploy.yml`)

## Datenschutz (verbindlich)
- **Keine echten SuS-Namen oder sonstigen Personendaten im Repository** (auch nicht in Tests, Beispielen, Commits). Das Repo ist öffentlich.
- Personendaten nur zur Laufzeit aus dem OneDrive laden.
- Keine Diagnosen oder besonders schützenswerten Daten speichern.

## Konventionen
- UI-Texte auf Schweizer Hochdeutsch (ss statt ß), SuS = Schülerinnen und Schüler
- Dateiformat der Vault-Daten siehe Spezifikation (eine Beobachtungsdatei pro Tag, Dataview-Inline-Felder, Wikilinks auf SuS-Dateinamen)
- Schreiben in den OneDrive mit ETag (`If-Match`), um Konflikte zu vermeiden
- Code-Kommentare deutsch, knapp

## Befehle
- `npm run dev` – lokal starten
- `npm run build` – Produktions-Build nach `dist/`
- `npm run check` – Typprüfung

# Polier Pro — Hinweise für Claude Code

## Versionierung: bei JEDEM PR an drei Stellen anheben

Jeder PR, der in `main` gemerged wird, muss die Versionsnummer in **allen
drei** Dateien gleichzeitig erhöhen — nicht nur in einer, auch wenn der PR
selbst kein "Versions-Bump-PR" ist:

1. **`polier_pro/package.json`** — Feld `"version"`. Nach einer Änderung
   `npm install` laufen lassen, damit `package-lock.json` mitzieht.
2. **`polier_pro/public/sw.js`** — Konstante `APP_VERSION` (Zeile ~9).
   Bestimmt den Service-Worker-Cache-Namen; nur ein geänderter Name lässt
   bereits installierte PWAs den alten Cache verwerfen und die neuen
   Assets laden.
3. **`polier_pro/config.yaml`** — Feld `version:` (Home-Assistant-Add-on-
   Manifest). `.github/workflows/build.yml` liest **ausschließlich** diese
   Datei (`grep "^version:" polier_pro/config.yaml`), um den Docker-Image-
   Tag zu bestimmen, den der Home-Assistant-Supervisor mit der
   installierten Version vergleicht. Ohne Änderung hier zeigt Home
   Assistant niemals ein Update an, selbst wenn `package.json`/`sw.js`
   korrekt erhöht wurden.

Alle drei bekommen dieselbe neue Versionsnummer. Vor dem Commit mit
`npm run build` verifizieren und den exakten CI-Grep-Befehl lokal
nachstellen (`grep "^version:" polier_pro/config.yaml | head -1 | cut -d'"' -f2`),
um sicherzustellen, dass der neue Wert korrekt geparst wird.

Hintergrund: In früheren PRs wurde wiederholt nur eine oder zwei der drei
Stellen erhöht, wodurch Nutzer trotz gemergter Fixes keine neue Version
installieren konnten (PWA-Cache blieb alt) bzw. Home Assistant nie ein
Update anzeigte.

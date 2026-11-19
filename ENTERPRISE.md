# Polaris Kalkulation für größere Unternehmen

Was in Phase 7 dazukam und was auf Serverseite einzurichten ist. Alles setzt
`supabase-kalkulation-v2.sql` voraus (wiederholbar ausführbar).

## Konzern-Controlling

Menüpunkt **Konzern** in der Kalkulation. Er zeigt je Gesellschaft und
Niederlassung (Baum aus `gesellschaften.parent_id`) Auftragsbestand,
Leistung, Ist-Kosten und Ergebnis aus der jeweils letzten **gemeldeten**
Leistungsmeldung jedes Projekts. Ohne Meldung zählt der Auftragsstand.

Ampel je Projekt:

- **Rot:** Die Prognose ist negativ oder liegt mehr als 5 % unter der Kalkulation.
- **Gelb:** Die Prognose liegt unter der Kalkulation, oder die letzte Meldung ist älter als 45 Tage.
- **Grau:** Es gibt noch keine Meldung.

Wer was sieht, regeln die Kalkulationsrechte je Gesellschaft (RLS).

## ARGE

Im Reiter Controlling eines Projekts: Partner, Quoten (Summe 100 %), eigene
Firma, federführender Partner. Anteile werden centgenau verteilt
(Verfahren der größten Reste). Im Konzern zählt wahlweise nur die eigene
Quote. Der ARGE-Bericht wird als PDF erzeugt.

## BIM 5D

Die Schaltfläche **BIM** gibt es an zwei Stellen:

- **Im LV:** Die Mengen aus einem IFC-Modell werden zu LV-Mengen. Die vorherige Menge bleibt in `extra.bim` vermerkt.
- **Im Aufmaß (Abrechnung):** Je Bauteilgruppe entsteht eine Aufmaßzeile mit Quelle „Import“.

Gelesen werden die Mengen, die das CAD-Programm exportiert (Qto_…BaseQuantities). Polaris rechnet keine Geometrie nach. Die Zuordnung Gruppe → Position schlägt Polaris selbst vor oder die KI. Übernommen wird nur, wenn Einheit und Größe zusammenpassen.

## ERP und DATEV

Unter **Konzern › Export**:

- **DATEV-Buchungsstapel** für Ausgangsrechnungen und freigegebene NU-Rechnungen. Kostenstelle (KOST1) ist die Projektnummer. Die Konten kommen aus den DATEV-Einstellungen von Polaris; für § 13b gibt es den optionalen Schlüssel `erloeskonto13b`.
- **Controlling-CSV** je Periode und Kostenart (Soll, Ist, Prognose) und **Rechnungs-CSV**: Semikolon, UTF-8 mit BOM.
- **JSON** mit allem (`format: polaris-kalkulation-export`, `version: 1`).

Für eine laufende Anbindung (SAP, Dynamics, BI-Tools) gibt es Lesesichten mit RLS (`security_invoker`):

| Sicht | Inhalt |
|---|---|
| `kalk_export_controlling` | Projekt, Periode, Kostenart, Soll/Ist kumuliert, Prognose |
| `kalk_export_ergebnis` | Leistung, Kosten, Ergebnis kalkuliert/Prognose je Periode |
| `kalk_export_rechnungen` | gestellte Rechnungen mit Zahlungen |

Die Schnittstelle bekommt einen eigenen Benutzer mit Kalkulationsrecht
„Lesen“ auf die betreffenden Gesellschaften und liest per PostgREST:
`GET /rest/v1/kalk_export_ergebnis?periode=eq.2026-11`.
Den Service-Role-Schlüssel nie dafür verwenden.

## Single Sign-On (SAML)

Auf dem Desktop-Anmeldebildschirm steht „Mit Single Sign-On der Firma
anmelden“. Die Firmen-Domain leitet zum Identity Provider weiter, zum
Beispiel Microsoft Entra ID, Okta oder Google Workspace.

Einrichtung in Supabase (Pro-Plan oder höher, SAML 2.0):

1. Im Supabase-Dashboard unter Authentication › Providers den Eintrag **SAML 2.0** aktivieren.
2. Den Anbieter mit der Supabase CLI anlegen:
   ```
   supabase sso add --type saml --project-ref <ref> \
     --metadata-url "https://login.microsoftonline.com/<tenant>/federationmetadata/2007-06/federationmetadata.xml" \
     --domains musterbau.de
   ```
3. Im Identity Provider eine Unternehmensanwendung mit der Entity-ID und ACS-URL aus `supabase sso info --project-ref <ref>` anlegen. Den Namen-Claim `email` freigeben.
4. Unter Authentication › URL Configuration die Polaris-Adresse als Redirect-URL eintragen.

Wichtig: Ein SSO-Benutzer braucht wie jeder andere ein Profil in Polaris,
also Firma und Rolle. Lade ihn deshalb vorher mit derselben E-Mail-Adresse
ein. Die mobile App und die PWA melden sich weiterhin mit Passwort an.

-- ═══════════════════════════════════════════════════════════════════════
-- KI-Kalkulation: Stammpositionen mit Rezeptur je Einheit
-- ═══════════════════════════════════════════════════════════════════════
-- Einmalig im Supabase SQL-Editor ausführen. Idempotent.
--
-- stammpositionen: firmeneigene Leistungspositionen mit Rezeptur je
-- Mengeneinheit (siehe polier_pro/src/lib/stammpositionen.js). Liegt wie
-- einheitspreise/kalkulationspreise als JSON am Firmen-Datensatz — die
-- bestehenden RLS-Regeln für firmen gelten damit unverändert.
--
-- standard_zuschlaege wird hier nur zur Sicherheit mit angelegt (falls in
-- einer Installation noch nicht vorhanden); die App liest die Spalte seit
-- diesem Stand auch tatsächlich beim Laden der Firma.

alter table firmen add column if not exists stammpositionen jsonb not null default '[]'::jsonb;
alter table firmen add column if not exists standard_zuschlaege jsonb;

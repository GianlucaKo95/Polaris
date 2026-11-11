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

-- ── Nachträge und interne Freigabe (Polaris 1.50) ─────────────────────────
-- nachtrag_zu: Bezug eines Nachtragsangebots auf den Auftrag (angenommenes
-- Angebot), dessen Urkalkulation der KI-Assistent zuerst verwendet.
-- interne_freigabe: { status: angefragt|freigegeben|zurueckgewiesen|geaendert,
-- von, am, notiz } — Polier reicht ein, GF/Administrator gibt frei.
-- Typ von nachtrag_zu folgt dem Typ von angebote.id (bigint oder uuid).
do $$
declare id_typ text;
begin
  select data_type into id_typ from information_schema.columns
    where table_schema = 'public' and table_name = 'angebote' and column_name = 'id';
  execute format('alter table angebote add column if not exists nachtrag_zu %s', coalesce(id_typ, 'bigint'));
end $$;
alter table angebote add column if not exists interne_freigabe jsonb;

-- Poliere dürfen Angebote ihrer Firma lesen, anlegen und (solange nicht
-- digital angenommen/gesperrt) ändern. Zusätzliche Policies — die
-- bestehenden für Administrator/Geschäftsführer bleiben unverändert.
-- Hinweis: Freigabe und Kundenlink werden in der App gesperrt; wer das auch
-- serverseitig erzwingen will, braucht einen Trigger auf interne_freigabe.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'angebote' and policyname = 'angebote_polier_lesen') then
    create policy "angebote_polier_lesen" on angebote for select using (
      eigene_rolle() = 'polier'
      and projekt_id in (select id from projekte where firma_id = eigene_firma_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'angebote' and policyname = 'angebote_polier_anlegen') then
    create policy "angebote_polier_anlegen" on angebote for insert with check (
      eigene_rolle() = 'polier'
      and projekt_id in (select id from projekte where firma_id = eigene_firma_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'angebote' and policyname = 'angebote_polier_aendern') then
    create policy "angebote_polier_aendern" on angebote for update using (
      eigene_rolle() = 'polier' and coalesce(gesperrt, false) = false
      and projekt_id in (select id from projekte where firma_id = eigene_firma_id()));
  end if;
end $$;

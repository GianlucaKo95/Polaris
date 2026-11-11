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

-- ── Freigaberegeln (Polaris 1.51) ─────────────────────────────────────────
-- angebot_regeln: { kompetenzgrenzePolier, rotErfordertFreigabe,
-- manuellePreiseErfordernFreigabe } — siehe src/lib/angebotRegeln.js.
alter table firmen add column if not exists angebot_regeln jsonb;

-- ── Kalkulationsgrundlagen (Polaris 1.52) ─────────────────────────────────
-- { mittellohn: {...}, geraete: [...] } — siehe src/lib/kalkulationsgrundlagen.js
alter table firmen add column if not exists kalkulationsgrundlagen jsonb;

-- ── Endsummenkalkulation und Nachtragsmanagement (Polaris 1.53) ───────────
alter table angebote add column if not exists endsumme jsonb;
alter table angebote add column if not exists nachtrag_info jsonb;

-- ── Stunden je LV-Position (Polaris 1.55) ─────────────────────────────────
-- Der Polier verteilt die Tagesstunden auf die Positionen der beauftragten
-- Angebote (views/LeistungView.jsx). position_id als Text, weil Positions-
-- IDs in angebote.positionen clientseitig vergeben werden.
do $$
declare id_typ text;
begin
  select data_type into id_typ from information_schema.columns
    where table_schema = 'public' and table_name = 'angebote' and column_name = 'id';
  execute format($f$
    create table if not exists stunden_positionen (
      id           bigserial primary key,
      projekt_id   int references projekte(id) on delete cascade,
      angebot_id   %s,
      position_id  text not null,
      datum        date not null,
      stunden      numeric(8,2) not null default 0,
      erfasst_von  uuid default auth.uid(),
      created_at   timestamptz default now()
    )$f$, coalesce(id_typ, 'bigint'));
end $$;
create index if not exists stunden_positionen_projekt on stunden_positionen(projekt_id, datum);
alter table stunden_positionen enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'stunden_positionen' and policyname = 'stunden_positionen_firma') then
    create policy "stunden_positionen_firma" on stunden_positionen for all using (
      projekt_id in (select id from projekte where firma_id = eigene_firma_id())
      and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter','polier')
    ) with check (
      projekt_id in (select id from projekte where firma_id = eigene_firma_id())
      and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter','polier')
    );
  end if;
end $$;

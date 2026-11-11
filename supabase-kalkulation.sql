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

-- ── CO₂-Faktoren der Firma (Polaris 1.63, lib/co2.js) ──────────────────
alter table firmen add column if not exists co2_faktoren jsonb not null default '[]'::jsonb;

-- ── Lohnvorerfassung (Polaris 1.64, lib/lohnvorerfassung.js) ────────────
alter table firmen add column if not exists lohn_einstellungen jsonb;
create table if not exists lohn_monat (
  id          bigserial primary key,
  firma_id    int not null references firmen(id) on delete cascade,
  monat       date not null,                 -- immer der 1. des Monats
  profil_id   uuid not null references profile(id) on delete cascade,
  eingaben    jsonb not null default '{}'::jsonb,  -- schlechtwetter, erschwernis, ausloese
  updated_at  timestamptz default now(),
  unique (firma_id, monat, profil_id)
);
alter table lohn_monat enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'lohn_monat' and policyname = 'lohn_monat_firma') then
    create policy "lohn_monat_firma" on lohn_monat for all using (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter')
    ) with check (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter')
    );
  end if;
end $$;

-- ── Finanz-Nebenbuch (Polaris 1.65, lib/fibu.js) ─────────────────────────
alter table rechnungen add column if not exists zahlungen jsonb not null default '[]'::jsonb;
alter table rechnungen add column if not exists mahnungen jsonb not null default '[]'::jsonb;
alter table rechnungen add column if not exists faellig_am date;
create table if not exists eingangsrechnungen (
  id              bigserial primary key,
  firma_id        int not null references firmen(id) on delete cascade,
  projekt_id      bigint references projekte(id) on delete set null,
  lieferant       text not null,
  rechnungsnr     text default '',
  datum           date not null,
  faellig_am      date,
  netto           numeric(12,2),
  ust_satz        numeric(5,2) default 19,
  brutto          numeric(12,2) not null,
  konto           text,
  kreditorenkonto text,
  bauleistung     boolean default false,   -- Subunternehmer-Bauleistung (§ 48 EStG)
  freistellung    boolean default false,   -- Freistellungsbescheinigung liegt vor
  skonto_prozent  numeric(5,2),
  skonto_tage     int,
  status          text default 'offen',
  zahlungen       jsonb not null default '[]'::jsonb,
  notiz           text default '',
  erfasst_von     uuid default auth.uid(),
  created_at      timestamptz default now()
);
create index if not exists eingangsrechnungen_firma on eingangsrechnungen(firma_id, datum);
alter table eingangsrechnungen enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'eingangsrechnungen' and policyname = 'eingangsrechnungen_firma') then
    create policy "eingangsrechnungen_firma" on eingangsrechnungen for all using (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer')
    ) with check (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer')
    );
  end if;
end $$;

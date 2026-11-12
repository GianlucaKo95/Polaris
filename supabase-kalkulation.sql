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

-- ═══ Geräteverwaltung (1.71) ═══════════════════════════════════════════
-- Inventar mit Standort, Prüffristen, Wartung und Einsatzhistorie (für die
-- interne Gerätemiete je Baustelle). Logik: src/lib/geraete.js.
create table if not exists geraete (
  id              bigserial primary key,
  firma_id        int not null references firmen(id) on delete cascade,
  inventarnr      text default '',
  bezeichnung     text not null,
  kategorie       text default '',
  grundlage_id    bigint,                       -- Gerät aus firmen.kalkulationsgrundlagen.geraete (BGL-Stundensatz)
  tagessatz       numeric(10,2),                -- interne Miete € je Arbeitstag; leer = Stundensatz × stunden_je_tag
  stunden_je_tag  numeric(4,1) default 8,
  status          text not null default 'verfuegbar',  -- verfuegbar | einsatz | werkstatt | ausgemustert
  projekt_id      bigint references projekte(id) on delete set null,
  pruefungen      jsonb not null default '[]'::jsonb,  -- [{ art, intervall_monate, zuletzt }]
  wartungen       jsonb not null default '[]'::jsonb,  -- [{ datum, text, kosten }]
  einsaetze       jsonb not null default '[]'::jsonb,  -- [{ projekt_id, von, bis }]
  notiz           text default '',
  created_at      timestamptz default now()
);
create index if not exists geraete_firma on geraete(firma_id);
alter table geraete enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'geraete' and policyname = 'geraete_lesen') then
    create policy "geraete_lesen" on geraete for select using (firma_id = eigene_firma_id());
  end if;
  -- Umsetzen und Prüfung eintragen dürfen auch Bauleiter und Polier
  if not exists (select 1 from pg_policies where tablename = 'geraete' and policyname = 'geraete_schreiben') then
    create policy "geraete_schreiben" on geraete for all using (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter','polier')
    ) with check (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter','polier')
    );
  end if;
end $$;

-- ═══ Regieberichte / Stundenlohnzettel (1.72) ═══════════════════════════
-- § 15 VOB/B: Personal, Geräte, Material je Tag, Unterschrift des AG,
-- Rückgabefrist 6 Werktage. Logik: src/lib/regie.js.
alter table firmen add column if not exists regie_einstellungen jsonb;   -- { lohnsaetze: [{ bez, satz }], materialZuschlag, fristWerktage }
create table if not exists regieberichte (
  id              bigserial primary key,
  firma_id        int not null references firmen(id) on delete cascade,
  projekt_id      bigint not null references projekte(id) on delete cascade,
  nummer          int not null,
  datum           date not null,
  beschreibung    text default '',
  angeordnet_von  text default '',
  personal        jsonb not null default '[]'::jsonb,
  geraete         jsonb not null default '[]'::jsonb,
  material        jsonb not null default '[]'::jsonb,
  status          text not null default 'entwurf',     -- entwurf | eingereicht | unterschrieben | beanstandet
  eingereicht_am  date,
  unterschrift    jsonb,                                -- { name, am, bild (PNG als data-URL) }
  beanstandung    text default '',
  abgerechnet_in  jsonb,                                -- { angebot_id, am }
  erstellt_von    uuid default auth.uid(),
  created_at      timestamptz default now(),
  unique (projekt_id, nummer)
);
create index if not exists regieberichte_projekt on regieberichte(projekt_id, datum);
alter table regieberichte enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'regieberichte' and policyname = 'regieberichte_lesen') then
    create policy "regieberichte_lesen" on regieberichte for select using (firma_id = eigene_firma_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'regieberichte' and policyname = 'regieberichte_schreiben') then
    create policy "regieberichte_schreiben" on regieberichte for all using (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter','polier','vorarbeiter')
    ) with check (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter','polier','vorarbeiter')
      and projekt_id in (select id from projekte where firma_id = eigene_firma_id())
    );
  end if;
end $$;

-- ═══ Personal- und Geräteplanung (1.73) ═════════════════════════════════
-- Je Ressource (Kolonne nach Namen oder Gerät) und Kalenderwoche eine
-- Baustelle. Logik: src/lib/planung.js.
create table if not exists einsatzplan (
  id              bigserial primary key,
  firma_id        int not null references firmen(id) on delete cascade,
  art             text not null,                 -- kolonne | geraet
  ressource       text not null,                 -- "kolonne:<name klein>" | "geraet:<id>"
  ressource_name  text default '',
  projekt_id      bigint not null references projekte(id) on delete cascade,
  woche           date not null,                 -- Montag der Kalenderwoche
  notiz           text default '',
  created_at      timestamptz default now(),
  unique (firma_id, ressource, woche)
);
create index if not exists einsatzplan_woche on einsatzplan(firma_id, woche);
alter table einsatzplan enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'einsatzplan' and policyname = 'einsatzplan_lesen') then
    create policy "einsatzplan_lesen" on einsatzplan for select using (firma_id = eigene_firma_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'einsatzplan' and policyname = 'einsatzplan_schreiben') then
    create policy "einsatzplan_schreiben" on einsatzplan for all using (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter')
    ) with check (
      firma_id = eigene_firma_id() and eigene_rolle() in ('administrator','geschaeftsfuehrer','bauleiter')
      and projekt_id in (select id from projekte where firma_id = eigene_firma_id())
    );
  end if;
end $$;

-- ═══ Sicherheiten und Fristen (1.74) ════════════════════════════════════
-- Bürgschaften und Bareinbehalte (gestellt an AG / erhalten von NU) sowie
-- Gewährleistungs- und Vertragsfristen je Baustelle. Logik: src/lib/fristen.js.
create table if not exists sicherheiten (
  id              bigserial primary key,
  firma_id        int not null references firmen(id) on delete cascade,
  projekt_id      bigint references projekte(id) on delete set null,
  art             text not null,                  -- vertragserfuellung | gewaehrleistung | vorauszahlung | abschlag | einbehalt
  richtung        text not null default 'gestellt',  -- gestellt (an AG) | erhalten (von NU)
  partner         text default '',
  aussteller      text default '',                -- Bank / Kreditversicherer
  nummer          text default '',
  betrag          numeric(12,2),
  prozent         numeric(5,2),
  ausgestellt_am  date,
  befristet_bis   date,
  rueckgabe_am    date,                           -- vereinbarter Rückgabezeitpunkt (sonst nach VOB/B berechnet)
  status          text not null default 'gestellt',  -- gestellt | zurueckgefordert | zurueck
  aval_prozent    numeric(5,3),
  notiz           text default '',
  created_at      timestamptz default now()
);
create table if not exists fristen (
  id              bigserial primary key,
  firma_id        int not null references firmen(id) on delete cascade,
  projekt_id      bigint references projekte(id) on delete set null,
  art             text not null default 'sonstig',   -- gewaehrleistung | abnahme | schlusszahlung | vertrag | sonstig
  titel           text default '',
  datum           date,                           -- Termin (bei Gewährleistung: abweichend vereinbartes Ende)
  abnahme_am      date,
  jahre           numeric(4,1) default 4,
  erinnerung_tage int default 30,
  erledigt_am     date,
  notiz           text default '',
  created_at      timestamptz default now()
);
alter table sicherheiten enable row level security;
alter table fristen enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sicherheiten','fristen'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_firma') then
      execute format('create policy %I on %I for all using (firma_id = eigene_firma_id() and eigene_rolle() in (''administrator'',''geschaeftsfuehrer'',''bauleiter'')) with check (firma_id = eigene_firma_id() and eigene_rolle() in (''administrator'',''geschaeftsfuehrer'',''bauleiter''))', t || '_firma', t);
    end if;
  end loop;
end $$;

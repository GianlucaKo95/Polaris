-- ═══════════════════════════════════════════════════════════════════════════
-- Polaris Kalkulation · Phase 1 · Datenmodell
-- ═══════════════════════════════════════════════════════════════════════════
-- Eigener Bereich für Kalkulation, AVA, Abrechnung und Controlling. Läuft
-- neben der bisherigen Angebotserstellung (Tabelle angebote bleibt unberührt
-- und lesbar). Mehrfach ausführbar.
--
-- Voraussetzungen: supabase-saas.sql (firmen, eigene_firma_id) und
-- supabase-auth-rollen.sql (profile, eigene_rolle) sind eingespielt.
--
-- Tabellen
--   gesellschaften   Gesellschaften und Niederlassungen einer Firma
--   kalk_rechte      Rechte je Nutzer und Gesellschaft (optional)
--   kalk_projekte    ein Kalkulationsprojekt je Bauvorhaben
--   kalk_staende     Versionen: Angebot, Verhandlung, Auftrag, Arbeitskalk., Nachtrag
--   lv_knoten        LV-Baum: Titel, Positionen, Hinweise
--   kalk_ansaetze    Ansatzzeilen je Position (wird ab Phase 2 genutzt)
--   kalk_protokoll   jede Änderung mit Nutzer und Zeit, nur lesbar
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Gesellschaften ────────────────────────────────────────────────────────
create table if not exists gesellschaften (
  id          uuid primary key default gen_random_uuid(),
  firma_id    int not null references firmen(id) on delete cascade,
  parent_id   uuid references gesellschaften(id) on delete cascade,  -- gesetzt = Niederlassung
  name        text not null,
  kuerzel     text default '',
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists gesellschaften_firma on gesellschaften(firma_id);
-- KI-Funktionen je Gesellschaft abschaltbar (Phase 3)
alter table gesellschaften add column if not exists ki_aktiv boolean not null default true;

-- Jede Firma bekommt eine Hauptgesellschaft; kleine Firmen merken davon nichts.
insert into gesellschaften (firma_id, name)
select f.id, coalesce(nullif(f.name, ''), 'Hauptgesellschaft') from firmen f
where not exists (select 1 from gesellschaften g where g.firma_id = f.id);

-- ─── Rechte ────────────────────────────────────────────────────────────────
-- Stufen: 1 lesen · 2 kalkulieren · 3 freigeben · 4 verwalten.
-- Hat ein Nutzer keinen Eintrag, gilt seine Polaris-Rolle (kalk_recht unten).
create table if not exists kalk_rechte (
  id              uuid primary key default gen_random_uuid(),
  firma_id        int not null references firmen(id) on delete cascade,
  profil_id       uuid not null references profile(id) on delete cascade,
  gesellschaft_id uuid references gesellschaften(id) on delete cascade,  -- null = alle Gesellschaften
  stufe           int not null check (stufe between 1 and 4),
  unique (profil_id, gesellschaft_id)
);

create or replace function kalk_recht(p_gesellschaft uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  explizit int;
  hat_eintrag boolean;
  eltern uuid;
begin
  select parent_id into eltern from gesellschaften where id = p_gesellschaft;
  select exists (select 1 from kalk_rechte where profil_id = auth.uid()) into hat_eintrag;
  if hat_eintrag then
    select max(stufe) into explizit from kalk_rechte
    where profil_id = auth.uid() and firma_id = eigene_firma_id()
      and (gesellschaft_id is null or gesellschaft_id = p_gesellschaft or gesellschaft_id = eltern);
    return coalesce(explizit, 0);
  end if;
  return case eigene_rolle()::text
    when 'administrator' then 4
    when 'geschaeftsfuehrer' then 4
    when 'bauleiter' then 3
    when 'polier' then 1
    else 0 end;
end $$;

-- ─── Kalkulationsprojekte ──────────────────────────────────────────────────
create table if not exists kalk_projekte (
  id               uuid primary key default gen_random_uuid(),
  firma_id         int not null references firmen(id) on delete cascade,
  gesellschaft_id  uuid not null references gesellschaften(id),
  projekt_id       bigint references projekte(id) on delete set null,   -- Baustelle in Polaris, sobald es eine gibt
  nummer           text default '',
  name             text not null,
  auftraggeber     text default '',
  ort              text default '',
  status           text not null default 'anfrage'
                   check (status in ('anfrage','in_bearbeitung','abgegeben','auftrag','verloren','abgerechnet','archiviert')),
  abgabe_am        date,
  verantwortlich   uuid references profile(id) on delete set null,
  notiz            text default '',
  aktueller_stand  uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create index if not exists kalk_projekte_firma on kalk_projekte(firma_id, status);
create unique index if not exists kalk_projekte_projekt on kalk_projekte(firma_id, projekt_id) where projekt_id is not null;

-- ─── Stände ────────────────────────────────────────────────────────────────
create table if not exists kalk_staende (
  id               uuid primary key default gen_random_uuid(),
  firma_id         int not null references firmen(id) on delete cascade,
  kalk_projekt_id  uuid not null references kalk_projekte(id) on delete cascade,
  art              text not null default 'angebot'
                   check (art in ('angebot','verhandlung','auftrag','arbeitskalkulation','nachtrag')),
  nummer           int not null default 1,
  bezeichnung      text default '',
  basis_id         uuid references kalk_staende(id) on delete set null,  -- aus welchem Stand kopiert
  gesperrt         boolean not null default false,
  gesperrt_am      timestamptz,
  gesperrt_von     uuid,
  freigabe_status  text not null default 'offen' check (freigabe_status in ('offen','angefragt','freigegeben','abgelehnt')),
  freigabe_von     uuid,
  freigabe_am      timestamptz,
  nachlass         numeric(6,3) not null default 0,   -- Nachlass auf die Netto-Summe in %
  mwst             numeric(5,2) not null default 19,
  zuschlaege       jsonb not null default '{}'::jsonb, -- Zuschlagsmodell, Mittellohn (siehe lib/kalk/rechenkern.js)
  altes_angebot_id text,                  -- Herkunft bei Migration aus angebote (id als Text: bigint oder uuid)
  summe_netto      numeric(16,2),         -- beim Sperren eingefroren (vor Nachlass)
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create index if not exists kalk_staende_projekt on kalk_staende(kalk_projekt_id);
alter table kalk_staende add column if not exists zuschlaege jsonb not null default '{}'::jsonb;
create unique index if not exists kalk_staende_altes_angebot on kalk_staende(firma_id, altes_angebot_id) where altes_angebot_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kalk_projekte_aktueller_stand_fk') then
    alter table kalk_projekte add constraint kalk_projekte_aktueller_stand_fk
      foreign key (aktueller_stand) references kalk_staende(id) on delete set null;
  end if;
end $$;

-- ─── LV-Knoten ─────────────────────────────────────────────────────────────
create table if not exists lv_knoten (
  id          uuid primary key default gen_random_uuid(),
  firma_id    int not null references firmen(id) on delete cascade,
  stand_id    uuid not null references kalk_staende(id) on delete cascade,
  parent_id   uuid references lv_knoten(id) on delete cascade,
  sort        double precision not null default 0,
  typ         text not null check (typ in ('titel','position','hinweis')),
  oz          text default '',
  art         text not null default 'normal' check (art in ('normal','zulage','bedarf_mit','bedarf','alternativ','pauschal')),
  kurztext    text default '',
  langtext    text default '',
  menge       numeric(16,3) not null default 0,
  einheit     text default '',
  ep          numeric(14,2) not null default 0,
  rabatt      numeric(6,3) not null default 0,
  stlk        text,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists lv_knoten_stand on lv_knoten(stand_id, parent_id, sort);

-- ─── Ansätze (Phase 2) ─────────────────────────────────────────────────────
create table if not exists kalk_ansaetze (
  id           uuid primary key default gen_random_uuid(),
  firma_id     int not null references firmen(id) on delete cascade,
  stand_id     uuid not null references kalk_staende(id) on delete cascade,
  knoten_id    uuid not null references lv_knoten(id) on delete cascade,
  sort         double precision not null default 0,
  kostenart    text not null check (kostenart in ('lohn','material','geraet','fremd','sonstiges')),
  ressource_id text,                       -- Kalkulationspreis aus den Stammdaten ("ml" = Mittellohn des Stands)
  bezeichnung  text default '',
  einheit      text default '',
  menge_je_me  numeric(16,6) not null default 0,
  faktor       numeric(12,6) not null default 1,
  preis        numeric(14,4) not null default 0,
  formel       text,
  kommentar    text default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid()
);
create index if not exists kalk_ansaetze_knoten on kalk_ansaetze(knoten_id, sort);
create index if not exists kalk_ansaetze_stand on kalk_ansaetze(stand_id);

-- ─── Summen je Stand ───────────────────────────────────────────────────────
-- Dieselbe Regel wie lib/kalk/lvBaum.js und GAEB: UP = EP × (1 − Rabatt) auf Cent,
-- GP = Menge × UP auf Cent,
-- Bedarf ohne GB und Alternativen nicht in der Summe.
create or replace view kalk_stand_summen with (security_invoker = true) as
select stand_id,
       count(*) filter (where typ = 'position')                                 as positionen,
       coalesce(sum(round(menge * round(ep * (1 - rabatt / 100), 2), 2))
         filter (where typ = 'position' and art not in ('bedarf','alternativ')), 0) as netto
from lv_knoten group by stand_id;

-- ─── Gesperrte Stände sind unveränderlich ──────────────────────────────────
create or replace function kalk_stand_offen_pruefen()
returns trigger language plpgsql as $$
declare sid uuid; zu boolean;
begin
  sid := coalesce(new.stand_id, old.stand_id);
  if tg_op = 'UPDATE' and old.stand_id <> new.stand_id then
    raise exception 'Knoten kann nicht in einen anderen Stand verschoben werden';
  end if;
  select gesperrt into zu from kalk_staende where id = sid;
  if zu then raise exception 'Der Stand ist gesperrt. Für Änderungen einen neuen Stand anlegen.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists lv_knoten_offen on lv_knoten;
create trigger lv_knoten_offen before insert or update or delete on lv_knoten
  for each row execute function kalk_stand_offen_pruefen();
drop trigger if exists kalk_ansaetze_offen on kalk_ansaetze;
create trigger kalk_ansaetze_offen before insert or update or delete on kalk_ansaetze
  for each row execute function kalk_stand_offen_pruefen();

create or replace function kalk_stand_sperre_pruefen()
returns trigger language plpgsql as $$
begin
  if old.gesperrt and not new.gesperrt then
    raise exception 'Ein gesperrter Stand bleibt gesperrt';
  end if;
  if old.gesperrt and (new.kalk_projekt_id <> old.kalk_projekt_id or new.art <> old.art or new.nummer <> old.nummer
                       or new.summe_netto is distinct from old.summe_netto
                       or new.nachlass <> old.nachlass or new.mwst <> old.mwst
                       or new.zuschlaege is distinct from old.zuschlaege) then
    raise exception 'Ein gesperrter Stand bleibt unverändert';
  end if;
  if new.gesperrt and not old.gesperrt then
    new.gesperrt_am := now();
    new.gesperrt_von := auth.uid();
    select netto into new.summe_netto from kalk_stand_summen where stand_id = new.id;
    new.summe_netto := coalesce(new.summe_netto, 0);
  end if;
  return new;
end $$;
drop trigger if exists kalk_staende_sperre on kalk_staende;
create trigger kalk_staende_sperre before update on kalk_staende
  for each row execute function kalk_stand_sperre_pruefen();

-- Gesperrte Stände lassen sich nicht löschen (Urkalkulation bleibt beweisbar)
create or replace function kalk_stand_loeschen_pruefen()
returns trigger language plpgsql as $$
begin
  if old.gesperrt and pg_trigger_depth() = 1 then
    raise exception 'Ein gesperrter Stand kann nicht gelöscht werden';
  end if;
  return old;
end $$;
drop trigger if exists kalk_staende_loeschen on kalk_staende;
create trigger kalk_staende_loeschen before delete on kalk_staende
  for each row execute function kalk_stand_loeschen_pruefen();

-- ─── Protokoll ─────────────────────────────────────────────────────────────
create table if not exists kalk_protokoll (
  id            bigserial primary key,
  firma_id      int not null,
  tabelle       text not null,
  datensatz_id  uuid not null,
  kalk_projekt_id uuid,
  stand_id      uuid,
  aktion        text not null check (aktion in ('anlegen','aendern','loeschen')),
  aenderung     jsonb not null default '{}'::jsonb,   -- { feld: [alt, neu] }
  user_id       uuid,
  zeit          timestamptz not null default now()
);
create index if not exists kalk_protokoll_projekt on kalk_protokoll(kalk_projekt_id, zeit desc);
create index if not exists kalk_protokoll_datensatz on kalk_protokoll(datensatz_id, zeit desc);

create or replace function kalk_protokollieren()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  alt jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  neu jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  diff jsonb := '{}'::jsonb;
  k text;
  zeile jsonb := case when tg_op = 'DELETE' then alt else neu end;
  projekt uuid;
  stand uuid;
begin
  -- Massenkopie eines Stands: ein Eintrag für den Stand statt 20.000 für die Knoten
  if tg_table_name in ('lv_knoten','kalk_ansaetze') and current_setting('kalk.massenkopie', true) = 'an' then
    return null;
  end if;
  for k in select jsonb_object_keys(alt || neu) loop
    if k in ('updated_at','updated_by','created_at','created_by') then continue; end if;
    if (alt -> k) is distinct from (neu -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_array(alt -> k, neu -> k));
    end if;
  end loop;
  if tg_op = 'UPDATE' and diff = '{}'::jsonb then return null; end if;

  if tg_table_name = 'kalk_projekte' then
    projekt := (zeile ->> 'id')::uuid;
  elsif tg_table_name = 'kalk_staende' then
    projekt := (zeile ->> 'kalk_projekt_id')::uuid; stand := (zeile ->> 'id')::uuid;
  elsif zeile ? 'kalk_projekt_id' then
    projekt := (zeile ->> 'kalk_projekt_id')::uuid; stand := (zeile ->> 'stand_id')::uuid;
  else
    stand := (zeile ->> 'stand_id')::uuid;
    select kalk_projekt_id into projekt from kalk_staende where id = stand;
  end if;

  insert into kalk_protokoll (firma_id, tabelle, datensatz_id, kalk_projekt_id, stand_id, aktion, aenderung, user_id)
  values ((zeile ->> 'firma_id')::int, tg_table_name, (zeile ->> 'id')::uuid, projekt, stand,
          case tg_op when 'INSERT' then 'anlegen' when 'UPDATE' then 'aendern' else 'loeschen' end,
          case when tg_op = 'UPDATE' then diff else jsonb_build_object('kurz', coalesce(zeile ->> 'kurztext', zeile ->> 'name', zeile ->> 'bezeichnung', zeile ->> 'titel', '')) end,
          auth.uid());
  return null;
end $$;

drop trigger if exists kalk_projekte_protokoll on kalk_projekte;
create trigger kalk_projekte_protokoll after insert or update or delete on kalk_projekte
  for each row execute function kalk_protokollieren();
drop trigger if exists kalk_staende_protokoll on kalk_staende;
create trigger kalk_staende_protokoll after insert or update or delete on kalk_staende
  for each row execute function kalk_protokollieren();
drop trigger if exists lv_knoten_protokoll on lv_knoten;
create trigger lv_knoten_protokoll after insert or update or delete on lv_knoten
  for each row execute function kalk_protokollieren();
drop trigger if exists kalk_ansaetze_protokoll on kalk_ansaetze;
create trigger kalk_ansaetze_protokoll after insert or update or delete on kalk_ansaetze
  for each row execute function kalk_protokollieren();

-- updated_at an Projekten
drop trigger if exists kalk_projekte_updated on kalk_projekte;
create trigger kalk_projekte_updated before update on kalk_projekte
  for each row execute function update_updated_at();

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table gesellschaften enable row level security;
alter table kalk_rechte    enable row level security;
alter table kalk_projekte  enable row level security;
alter table kalk_staende   enable row level security;
alter table lv_knoten      enable row level security;
alter table kalk_ansaetze  enable row level security;
alter table kalk_protokoll enable row level security;

drop policy if exists gesellschaften_lesen on gesellschaften;
create policy gesellschaften_lesen on gesellschaften for select using (firma_id = eigene_firma_id());
drop policy if exists gesellschaften_verwalten on gesellschaften;
create policy gesellschaften_verwalten on gesellschaften for all
  using (firma_id = eigene_firma_id() and eigene_rolle()::text in ('administrator','geschaeftsfuehrer'))
  with check (firma_id = eigene_firma_id() and eigene_rolle()::text in ('administrator','geschaeftsfuehrer'));

drop policy if exists kalk_rechte_lesen on kalk_rechte;
create policy kalk_rechte_lesen on kalk_rechte for select using (firma_id = eigene_firma_id());
drop policy if exists kalk_rechte_verwalten on kalk_rechte;
create policy kalk_rechte_verwalten on kalk_rechte for all
  using (firma_id = eigene_firma_id() and eigene_rolle()::text in ('administrator','geschaeftsfuehrer'))
  with check (firma_id = eigene_firma_id() and eigene_rolle()::text in ('administrator','geschaeftsfuehrer'));

drop policy if exists kalk_projekte_lesen on kalk_projekte;
create policy kalk_projekte_lesen on kalk_projekte for select
  using (firma_id = eigene_firma_id() and kalk_recht(gesellschaft_id) >= 1);
drop policy if exists kalk_projekte_schreiben on kalk_projekte;
create policy kalk_projekte_schreiben on kalk_projekte for insert
  with check (firma_id = eigene_firma_id() and kalk_recht(gesellschaft_id) >= 2);
drop policy if exists kalk_projekte_aendern on kalk_projekte;
create policy kalk_projekte_aendern on kalk_projekte for update
  using (firma_id = eigene_firma_id() and kalk_recht(gesellschaft_id) >= 2)
  with check (firma_id = eigene_firma_id() and kalk_recht(gesellschaft_id) >= 2);
drop policy if exists kalk_projekte_loeschen on kalk_projekte;
create policy kalk_projekte_loeschen on kalk_projekte for delete
  using (firma_id = eigene_firma_id() and kalk_recht(gesellschaft_id) >= 4);

-- Stände, Knoten und Ansätze folgen den Rechten ihres Projekts
create or replace function kalk_projekt_recht(p_projekt uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select kalk_recht(gesellschaft_id) from kalk_projekte
                   where id = p_projekt and firma_id = eigene_firma_id()), 0);
$$;
create or replace function kalk_stand_recht(p_stand uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select kalk_projekt_recht(kalk_projekt_id) from kalk_staende where id = p_stand), 0);
$$;

drop policy if exists kalk_staende_lesen on kalk_staende;
create policy kalk_staende_lesen on kalk_staende for select
  using (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 1);
drop policy if exists kalk_staende_schreiben on kalk_staende;
create policy kalk_staende_schreiben on kalk_staende for all
  using (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 2)
  with check (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 2);

-- Bei großen LVs wird die Rechteprüfung je Stand einmal ausgewertet (Unterabfrage)
drop policy if exists lv_knoten_lesen on lv_knoten;
create policy lv_knoten_lesen on lv_knoten for select
  using (firma_id = eigene_firma_id() and stand_id in (select id from kalk_staende));
drop policy if exists lv_knoten_schreiben on lv_knoten;
create policy lv_knoten_schreiben on lv_knoten for all
  using (firma_id = eigene_firma_id() and stand_id in (select s.id from kalk_staende s where kalk_projekt_recht(s.kalk_projekt_id) >= 2))
  with check (firma_id = eigene_firma_id() and stand_id in (select s.id from kalk_staende s where kalk_projekt_recht(s.kalk_projekt_id) >= 2));

drop policy if exists kalk_ansaetze_lesen on kalk_ansaetze;
create policy kalk_ansaetze_lesen on kalk_ansaetze for select
  using (firma_id = eigene_firma_id() and stand_id in (select id from kalk_staende));
drop policy if exists kalk_ansaetze_schreiben on kalk_ansaetze;
create policy kalk_ansaetze_schreiben on kalk_ansaetze for all
  using (firma_id = eigene_firma_id() and stand_id in (select s.id from kalk_staende s where kalk_projekt_recht(s.kalk_projekt_id) >= 2))
  with check (firma_id = eigene_firma_id() and stand_id in (select s.id from kalk_staende s where kalk_projekt_recht(s.kalk_projekt_id) >= 2));

-- Protokoll: nur lesen; geschrieben wird ausschließlich über den Trigger
drop policy if exists kalk_protokoll_lesen on kalk_protokoll;
create policy kalk_protokoll_lesen on kalk_protokoll for select
  using (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 1);

grant select, insert, update, delete on gesellschaften, kalk_rechte, kalk_projekte, kalk_staende, lv_knoten, kalk_ansaetze to authenticated;
grant select on kalk_protokoll, kalk_stand_summen to authenticated;

-- ─── Neuer Stand als Kopie (eine Transaktion, auch bei 20.000 Positionen) ──
create or replace function kalk_stand_kopieren(p_basis uuid, p_art text, p_bezeichnung text default '')
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  b kalk_staende;
  v_neu uuid := gen_random_uuid();
  nr int;
begin
  select * into b from kalk_staende where id = p_basis;
  if not found then raise exception 'Stand nicht gefunden'; end if;
  perform set_config('kalk.massenkopie', 'an', true);
  select coalesce(max(nummer), 0) + 1 into nr from kalk_staende where kalk_projekt_id = b.kalk_projekt_id;
  insert into kalk_staende (id, firma_id, kalk_projekt_id, art, nummer, bezeichnung, basis_id, nachlass, mwst, zuschlaege)
  values (v_neu, b.firma_id, b.kalk_projekt_id, p_art, nr, coalesce(p_bezeichnung, ''), b.id, b.nachlass, b.mwst, b.zuschlaege);

  create temp table if not exists _kk_map (alt uuid primary key, neu uuid) on commit drop;
  delete from _kk_map;
  insert into _kk_map select id, gen_random_uuid() from lv_knoten where stand_id = b.id;
  insert into lv_knoten (id, firma_id, stand_id, parent_id, sort, typ, oz, art, kurztext, langtext, menge, einheit, ep, rabatt, stlk, extra)
  select m.neu, k.firma_id, v_neu, mp.neu, k.sort, k.typ, k.oz, k.art, k.kurztext, k.langtext, k.menge, k.einheit, k.ep, k.rabatt, k.stlk, k.extra
  from lv_knoten k join _kk_map m on m.alt = k.id left join _kk_map mp on mp.alt = k.parent_id
  where k.stand_id = b.id
  order by (k.parent_id is not null), k.sort;
  insert into kalk_ansaetze (firma_id, stand_id, knoten_id, sort, kostenart, ressource_id, bezeichnung, einheit, menge_je_me, faktor, preis, formel, kommentar)
  select a.firma_id, v_neu, m.neu, a.sort, a.kostenart, a.ressource_id, a.bezeichnung, a.einheit, a.menge_je_me, a.faktor, a.preis, a.formel, a.kommentar
  from kalk_ansaetze a join _kk_map m on m.alt = a.knoten_id where a.stand_id = b.id;

  perform set_config('kalk.massenkopie', 'aus', true);
  update kalk_projekte set aktueller_stand = v_neu where id = b.kalk_projekt_id;
  return v_neu;
end $$;
grant execute on function kalk_stand_kopieren(uuid, text, text) to authenticated;
grant execute on function kalk_recht(uuid), kalk_projekt_recht(uuid), kalk_stand_recht(uuid) to authenticated;

-- ─── Viele Knoten auf einmal (GAEB-Import, Migration) ───────────────────────
-- Ein Aufruf statt tausender Einzel-Inserts; ein Protokolleintrag für den Import.
-- p_knoten: [{ id, parent_id, sort, typ, oz, art, kurztext, langtext, menge, einheit, ep, rabatt, stlk, extra }]
create or replace function kalk_knoten_einfuegen(p_stand uuid, p_knoten jsonb, p_anlass text default 'import')
returns int language plpgsql security definer set search_path = public as $$
declare
  f int;
  n int;
  projekt uuid;
begin
  if kalk_stand_recht(p_stand) < 2 then raise exception 'Keine Berechtigung für diesen Stand'; end if;
  select firma_id, kalk_projekt_id into f, projekt from kalk_staende where id = p_stand;
  perform set_config('kalk.massenkopie', 'an', true);
  insert into lv_knoten (id, firma_id, stand_id, parent_id, sort, typ, oz, art, kurztext, langtext, menge, einheit, ep, rabatt, stlk, extra)
  select coalesce(r.id, gen_random_uuid()), f, p_stand, r.parent_id, coalesce(r.sort, 0), r.typ, coalesce(r.oz, ''), coalesce(r.art, 'normal'),
         coalesce(r.kurztext, ''), coalesce(r.langtext, ''), coalesce(r.menge, 0), coalesce(r.einheit, ''), coalesce(r.ep, 0),
         coalesce(r.rabatt, 0), r.stlk, coalesce(r.extra, '{}'::jsonb)
  from jsonb_to_recordset(p_knoten) as r(id uuid, parent_id uuid, sort double precision, typ text, oz text, art text, kurztext text,
       langtext text, menge numeric, einheit text, ep numeric, rabatt numeric, stlk text, extra jsonb);
  get diagnostics n = row_count;
  if exists (select 1 from lv_knoten k join lv_knoten p on p.id = k.parent_id
             where k.stand_id = p_stand and p.stand_id <> p_stand) then
    raise exception 'Ein Knoten verweist auf einen Titel außerhalb dieses Stands';
  end if;
  perform set_config('kalk.massenkopie', 'aus', true);
  insert into kalk_protokoll (firma_id, tabelle, datensatz_id, kalk_projekt_id, stand_id, aktion, aenderung, user_id)
  values (f, 'lv_knoten', p_stand, projekt, p_stand, 'anlegen', jsonb_build_object('kurz', p_anlass || ': ' || n || ' Zeilen'), auth.uid());
  return n;
end $$;
grant execute on function kalk_knoten_einfuegen(uuid, jsonb, text) to authenticated;

-- ─── Viele Ansätze auf einmal (Bausteine, Migration) ───────────────────────
-- p_ansaetze: [{ id, knoten_id, sort, kostenart, ressource_id, bezeichnung, einheit, menge_je_me, faktor, preis, formel, kommentar }]
create or replace function kalk_ansaetze_einfuegen(p_stand uuid, p_ansaetze jsonb, p_anlass text default 'import')
returns int language plpgsql security definer set search_path = public as $$
declare
  f int;
  n int;
  projekt uuid;
begin
  if kalk_stand_recht(p_stand) < 2 then raise exception 'Keine Berechtigung für diesen Stand'; end if;
  select firma_id, kalk_projekt_id into f, projekt from kalk_staende where id = p_stand;
  if exists (select 1 from jsonb_to_recordset(p_ansaetze) as r(knoten_id uuid)
             where not exists (select 1 from lv_knoten k where k.id = r.knoten_id and k.stand_id = p_stand)) then
    raise exception 'Ein Ansatz verweist auf eine Position außerhalb dieses Stands';
  end if;
  perform set_config('kalk.massenkopie', 'an', true);
  insert into kalk_ansaetze (id, firma_id, stand_id, knoten_id, sort, kostenart, ressource_id, bezeichnung, einheit, menge_je_me, faktor, preis, formel, kommentar)
  select coalesce(r.id, gen_random_uuid()), f, p_stand, r.knoten_id, coalesce(r.sort, 0), r.kostenart, r.ressource_id, coalesce(r.bezeichnung, ''),
         coalesce(r.einheit, ''), coalesce(r.menge_je_me, 0), coalesce(r.faktor, 1), coalesce(r.preis, 0), r.formel, coalesce(r.kommentar, '')
  from jsonb_to_recordset(p_ansaetze) as r(id uuid, knoten_id uuid, sort double precision, kostenart text, ressource_id text, bezeichnung text,
       einheit text, menge_je_me numeric, faktor numeric, preis numeric, formel text, kommentar text);
  get diagnostics n = row_count;
  perform set_config('kalk.massenkopie', 'aus', true);
  insert into kalk_protokoll (firma_id, tabelle, datensatz_id, kalk_projekt_id, stand_id, aktion, aenderung, user_id)
  values (f, 'kalk_ansaetze', p_stand, projekt, p_stand, 'anlegen', jsonb_build_object('kurz', p_anlass || ': ' || n || ' Ansätze'), auth.uid());
  return n;
end $$;
grant execute on function kalk_ansaetze_einfuegen(uuid, jsonb, text) to authenticated;

-- ─── Live-Zusammenarbeit ───────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table lv_knoten; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table kalk_staende; exception when duplicate_object then null; end;
  end if;
end $$;


-- ═══ Phase 4: AVA und Vergabe ══════════════════════════════════════════════
-- Ein Vergabepaket bündelt Positionen (NU) oder Ressourcen (Lieferant) eines Stands,
-- sammelt Bieterpreise, bildet den Preisspiegel und hält die Vergabe fest.
-- Zeilen und Bieter liegen als jsonb vor (Struktur: lib/kalk/vergabe.js).
-- Vergaben sind nicht an die Standsperre gebunden: vergeben wird nach dem Auftrag.
create table if not exists kalk_vergaben (
  id               uuid primary key default gen_random_uuid(),
  firma_id         int not null references firmen(id) on delete cascade,
  kalk_projekt_id  uuid not null references kalk_projekte(id) on delete cascade,
  stand_id         uuid references kalk_staende(id) on delete set null,
  nummer           int not null default 1,
  titel            text not null default '',
  art              text not null default 'nu' check (art in ('nu','lieferant')),
  status           text not null default 'entwurf' check (status in ('entwurf','angefragt','ausgewertet','vergeben','aufgehoben')),
  frist            date,
  zeilen           jsonb not null default '[]'::jsonb,
  bieter           jsonb not null default '[]'::jsonb,
  vergeben_an      text,                   -- Bieter-ID aus bieter
  vergeben_am      timestamptz,
  vergabe_summe    numeric(16,2),          -- Netto nach Nachlass, beim Vergeben eingefroren
  budget_summe     numeric(16,2),
  auftrag          jsonb not null default '{}'::jsonb,
  notiz            text default '',
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now()
);
create index if not exists kalk_vergaben_projekt on kalk_vergaben(kalk_projekt_id);

drop trigger if exists kalk_vergaben_protokoll on kalk_vergaben;
create trigger kalk_vergaben_protokoll after insert or update or delete on kalk_vergaben
  for each row execute function kalk_protokollieren();
drop trigger if exists kalk_vergaben_updated on kalk_vergaben;
create trigger kalk_vergaben_updated before update on kalk_vergaben
  for each row execute function update_updated_at();

-- Stand muss zum Projekt gehören
create or replace function kalk_vergabe_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stand_id is not null and not exists
     (select 1 from kalk_staende where id = new.stand_id and kalk_projekt_id = new.kalk_projekt_id) then
    raise exception 'Der Stand gehört nicht zu diesem Projekt';
  end if;
  if new.status = 'vergeben' and new.vergeben_an is null then
    raise exception 'Vergabe ohne Bieter';
  end if;
  return new;
end $$;
drop trigger if exists kalk_vergaben_pruefen on kalk_vergaben;
create trigger kalk_vergaben_pruefen before insert or update on kalk_vergaben
  for each row execute function kalk_vergabe_pruefen();

alter table kalk_vergaben enable row level security;
drop policy if exists kalk_vergaben_lesen on kalk_vergaben;
create policy kalk_vergaben_lesen on kalk_vergaben for select
  using (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 1);
drop policy if exists kalk_vergaben_schreiben on kalk_vergaben;
create policy kalk_vergaben_schreiben on kalk_vergaben for all
  using (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 2)
  with check (firma_id = eigene_firma_id() and kalk_projekt_recht(kalk_projekt_id) >= 2);
grant select, insert, update, delete on kalk_vergaben to authenticated;

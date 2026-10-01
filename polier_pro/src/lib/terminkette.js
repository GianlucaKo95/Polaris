// Kritischer Pfad zwischen Aufgaben — klassische Vorwärts-/Rückwärtsrechnung
// (Critical Path Method) auf Basis von dauer_tage + abhaengig_von. Liefert
// pro Aufgabe früheste/späteste Start-/Endtermine, den verbleibenden Puffer
// und ob sie auf dem kritischen Pfad liegt (Puffer <= 0) — reine Berechnung
// aus echten Projektdaten, keine KI-Schätzung.

export function alsTag(datum) {
  const d = datum ? new Date(datum) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function tageAddieren(datum, tage) {
  const d = new Date(datum);
  d.setDate(d.getDate() + Math.round(tage));
  return d;
}

function tageDiff(a, b) {
  return Math.round((a - b) / 86400000);
}

export function berechneTerminkette(aufgaben) {
  const heute = alsTag(new Date());
  const byId = new Map(aufgaben.map(a => [a.id, a]));

  // Nur Abhängigkeiten berücksichtigen, die auf existierende Aufgaben
  // desselben Projekts zeigen — sonst blockieren gelöschte/fremde IDs die
  // Berechnung.
  const vorgaenger = new Map();
  const nachfolger = new Map();
  for (const a of aufgaben) {
    vorgaenger.set(a.id, (a.abhaengig_von || []).filter(id => byId.has(id) && id !== a.id));
    if (!nachfolger.has(a.id)) nachfolger.set(a.id, []);
  }
  for (const a of aufgaben) {
    for (const vId of vorgaenger.get(a.id)) {
      nachfolger.set(vId, [...(nachfolger.get(vId) || []), a.id]);
    }
  }

  // Topologische Reihenfolge (Kahn). Bei einem Zyklus (z.B. versehentlich
  // A hängt von B ab und B von A) werden die verbleibenden Aufgaben unsortiert
  // angehängt, statt die Berechnung komplett zu blockieren — sie werden dann
  // wie Aufgaben ohne Vorgänger behandelt.
  const inGrad = new Map(aufgaben.map(a => [a.id, vorgaenger.get(a.id).length]));
  const queue = aufgaben.filter(a => inGrad.get(a.id) === 0).map(a => a.id);
  const reihenfolge = [];
  const eingereiht = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    reihenfolge.push(id);
    for (const nId of nachfolger.get(id) || []) {
      inGrad.set(nId, inGrad.get(nId) - 1);
      if (inGrad.get(nId) === 0 && !eingereiht.has(nId)) { queue.push(nId); eingereiht.add(nId); }
    }
  }
  for (const a of aufgaben) if (!eingereiht.has(a.id)) reihenfolge.push(a.id);

  const ergebnis = new Map();

  // Vorwärtsrechnung: früheste Start-/Endtermine.
  for (const id of reihenfolge) {
    const a = byId.get(id);
    const dauer = a.dauer_tage > 0 ? a.dauer_tage : 1;
    if (a.status === "abgeschlossen") {
      const ende = alsTag(a.updated_at || a.created_at || heute);
      ergebnis.set(id, { startFrueh: ende, endeFrueh: ende });
      continue;
    }
    let startFrueh = heute;
    for (const vId of vorgaenger.get(id)) {
      const vErg = ergebnis.get(vId);
      if (vErg && vErg.endeFrueh > startFrueh) startFrueh = vErg.endeFrueh;
    }
    ergebnis.set(id, { startFrueh, endeFrueh: tageAddieren(startFrueh, dauer) });
  }

  const projektEnde = aufgaben.length
    ? new Date(Math.max(...aufgaben.map(a => ergebnis.get(a.id).endeFrueh.getTime())))
    : heute;

  // Rückwärtsrechnung: späteste Termine, Puffer, kritischer Pfad — in
  // umgekehrter topologischer Reihenfolge, damit Nachfolger vor ihren
  // Vorgängern berechnet sind.
  for (let i = reihenfolge.length - 1; i >= 0; i--) {
    const id = reihenfolge[i];
    const a = byId.get(id);
    const dauer = a.dauer_tage > 0 ? a.dauer_tage : 1;
    const eintrag = ergebnis.get(id);

    if (a.status === "abgeschlossen") {
      eintrag.startSpaet = eintrag.startFrueh;
      eintrag.endeSpaet = eintrag.endeFrueh;
      eintrag.puffer = 0;
      eintrag.kritisch = false;
      eintrag.terminkonflikt = false;
      continue;
    }

    let endeSpaet = projektEnde;
    for (const nId of nachfolger.get(id) || []) {
      const nErg = ergebnis.get(nId);
      if (nErg?.startSpaet && nErg.startSpaet < endeSpaet) endeSpaet = nErg.startSpaet;
    }
    const startSpaet = tageAddieren(endeSpaet, -dauer);
    eintrag.startSpaet = startSpaet;
    eintrag.endeSpaet = endeSpaet;
    eintrag.puffer = tageDiff(startSpaet, eintrag.startFrueh);
    eintrag.kritisch = eintrag.puffer <= 0;
    eintrag.terminkonflikt = !!a.faellig_am && eintrag.endeFrueh > alsTag(a.faellig_am);
  }

  return { proAufgabe: ergebnis, projektEnde };
}

// Vergleicht das berechnete Projektende gegen das späteste gesetzte
// Fälligkeitsdatum — die Terminprognose fürs Cockpit und den Gantt-Kopf.
export function terminprognose(aufgaben) {
  const { proAufgabe, projektEnde } = berechneTerminkette(aufgaben);
  const geplanteTermine = aufgaben.map(a => a.faellig_am).filter(Boolean).map(d => new Date(d).getTime());
  const zielTermin = geplanteTermine.length ? new Date(Math.max(...geplanteTermine)) : null;
  const deltaTage = zielTermin ? Math.round((projektEnde - zielTermin) / 86400000) : null;
  return { proAufgabe, projektEnde, zielTermin, deltaTage };
}

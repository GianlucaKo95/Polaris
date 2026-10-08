export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

const HTML_ESCAPES = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };

// Escaped Freitext, bevor er in ein window.document.write()-gerendertes
// PDF/Druck-Template eingefügt wird — ohne das kann jedes Textfeld
// (Tätigkeit, Besonderheiten, Mangel-Titel, Firmenname, ...) HTML/JS
// einschleusen, das beim Öffnen des Exports im selben Origin ausgeführt wird.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

// IBAN-Prüfsumme (ISO 7064 Mod 97-10) — fängt Tippfehler ab, bevor eine
// falsche Bankverbindung als Änderungsanfrage beim Administrator landet.
export function ibanGueltig(iban) {
  const bereinigt = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(bereinigt)) return false;
  const umgestellt = bereinigt.slice(4) + bereinigt.slice(0, 4);
  const numerisch = umgestellt.replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
  // Ziffernweise Modulo statt BigInt — bleibt jederzeit unter 970,
  // damit auch ältere Ziel-Browser (safari14-Build-Target) das können.
  let rest = 0;
  for (const ziffer of numerisch) rest = (rest * 10 + Number(ziffer)) % 97;
  return rest === 1;
}

// Zeigt nur die ersten 4 und letzten 4 Zeichen einer IBAN, Rest maskiert —
// für Listenansichten, in denen die volle Nummer nicht nötig ist.
export function ibanMaskiert(iban) {
  const bereinigt = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (bereinigt.length <= 8) return bereinigt;
  return `${bereinigt.slice(0,4)} •••• •••• ${bereinigt.slice(-4)}`;
}

export async function sha256Hex(text) {
  const bytes  = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("");
}

export function leereAufgabe() {
  return {
    id:           Date.now(),
    titel:        "",
    typ:          "allgemein",
    status:       "offen",
    prioritaet:   "mittel",
    faellig_am:   "",
    zustaendig:   "",
    soll_stunden: null,
    dauer_tage:   null,
    mindest_mitarbeiter: null,
    maximal_mitarbeiter: null,
    abhaengig_von: [],
    beschreibung: "",
    fotos:        [],
    behebung_fotos: [],
    ist_mangel:   false,
    plan_x:       null,
    plan_y:       null,
    // Betonfeld-Felder
    m2:           0,
    betonsorte:   "",
    festigkeit:   null,
    // Kosten
    budget_pos:   "",
    created_at:   new Date().toISOString(),
  };
}

export function leerProjekt() {
  return { id: Date.now(), name:"", adresse:"", plz:"", ort:"", projektnummer:"", bauleiter:"", auftraggeber:"",
    typ: "hochbau",
    farbe: ["#F5C400","#4A9EE0","#2EAF6A","#C45C2A","#9B59B6"][Math.floor(Math.random()*5)],
    felder:[], kolonnen:[], berichte:[] };
}

export const WMO_ICONS = {
  0:"☀️",1:"🌤️",2:"⛅",3:"☁️",
  45:"🌫️",48:"🌫️",
  51:"🌦️",53:"🌦️",55:"🌧️",
  61:"🌧️",63:"🌧️",65:"🌧️",
  71:"🌨️",73:"🌨️",75:"❄️",
  80:"🌦️",81:"🌧️",82:"⛈️",
  95:"⛈️",96:"⛈️",99:"⛈️",
};

export function wmoIcon(code) { return WMO_ICONS[code] || "🌡️"; }

// tempMin/tempMax erlauben die Prüfung einer ganzen Tagesspanne (z.B.
// Morgenfrost trotz warmem Tageshöchstwert) — bei einem einzelnen
// Momentanwert (aktuelle Messung) reicht "temp" für beide Grenzen.
export function betonCheck(w) {
  const warn = [];
  if (!w) return warn;
  const tempMin = w.tempMin ?? w.temp;
  const tempMax = w.tempMax ?? w.temp;
  if (tempMin < 5)   warn.push("🚫 Temperatur unter 5°C – Frostschutzmaßnahmen erforderlich");
  if (tempMax > 30)  warn.push("⚠️ Hitze über 30°C – Nachbehandlung intensivieren");
  if (w.wind > 40)   warn.push("🚫 Wind über 40 km/h – Betonage nicht empfohlen");
  if (w.rain > 5)    warn.push("🚫 Starkregen – Betonage stoppen");
  if (w.humidity>90) warn.push("⚠️ Sehr hohe Luftfeuchtigkeit");
  return warn;
}

// Einmalige 7-Tage-Vorhersage für einen Standort (Ort/PLZ) — dieselbe
// Geocoding- + Open-Meteo-Logik wie WeatherView, aber als einzelner Abruf
// statt reaktiver Komponente. Für Stellen, die nur einen aktuellen
// Datenschnappschuss brauchen (z.B. die KI-Kontextbildung), statt eine
// zweite <WeatherView> zu mounten.
export async function holeWettervorhersage(ort, plz) {
  if (!ort?.trim() && !plz?.trim()) return null;
  const ziel = plz?.trim() ? await geocodePLZ(plz, ort) : await geocodeAdresse(ort);
  if (!ziel) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ziel.lat}&longitude=${ziel.lon}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code`
      + `&timezone=Europe%2FBerlin&forecast_days=7`;
    const res = await fetch(url);
    const data = await res.json();
    return data.daily.time.slice(0, 7).map((day, i) => ({
      day:  ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(day).getDay()],
      date: day,
      max:  Math.round(data.daily.temperature_2m_max[i]),
      min:  Math.round(data.daily.temperature_2m_min[i]),
      rain: data.daily.precipitation_sum[i],
      wind: Math.round(data.daily.wind_speed_10m_max[i]),
    }));
  } catch { return null; }
}

// Stündliche Vorhersage für einen einzelnen Tag — nutzt precipitation_probability
// von Open-Meteo, eine ECHTE, vom Wettermodell berechnete Regenwahrscheinlichkeit
// (kein erfundener Wert). Für die Betonage-Zeitfenster-Empfehlung.
export async function holeStuendlicheVorhersage(ort, plz, datumISO) {
  if (!ort?.trim() && !plz?.trim()) return null;
  const ziel = plz?.trim() ? await geocodePLZ(plz, ort) : await geocodeAdresse(ort);
  if (!ziel) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ziel.lat}&longitude=${ziel.lon}`
      + `&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code`
      + `&timezone=Europe%2FBerlin&start_date=${datumISO}&end_date=${datumISO}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.hourly?.time) return null;
    return data.hourly.time.map((zeit, i) => ({
      stunde: new Date(zeit).getHours(),
      temp:   Math.round(data.hourly.temperature_2m[i]),
      regenWahrscheinlichkeit: data.hourly.precipitation_probability[i],
      regenMenge: data.hourly.precipitation[i],
      wind:   Math.round(data.hourly.wind_speed_10m[i]),
      icon:   wmoIcon(data.hourly.weather_code[i]),
    }));
  } catch { return null; }
}

// Grobe, transparente Eignungs-Heuristik (0-100) für eine einzelne Stunde,
// abgeleitet aus denselben Grenzwerten wie betonCheck() — KEINE
// wissenschaftliche Vorhersage, sondern eine nachvollziehbare Gewichtung
// aus echten Rohwerten. Immer zusammen mit den Rohwerten selbst zeigen,
// nie als eigenständige "KI-Prognose" ausgeben, damit niemand mehr
// Präzision hineinliest, als tatsächlich dahintersteckt.
export function betonageEignung(stunde) {
  let wert = 100;
  const gruende = [];
  if (stunde.regenWahrscheinlichkeit > 0) {
    wert -= Math.round(stunde.regenWahrscheinlichkeit * 0.6);
    if (stunde.regenWahrscheinlichkeit >= 50) gruende.push(`${stunde.regenWahrscheinlichkeit}% Regenwahrscheinlichkeit`);
  }
  if (stunde.regenMenge > 5) { wert -= 30; gruende.push("Starkregen erwartet"); }
  if (stunde.wind > 40) { wert -= 50; gruende.push(`Wind ${stunde.wind}km/h über Grenzwert`); }
  else if (stunde.wind > 25) { wert -= Math.round((stunde.wind - 25) * 2); }
  if (stunde.temp < 5) { wert -= 50; gruende.push(`Temperatur ${stunde.temp}°C unter Frostgrenze`); }
  else if (stunde.temp < 8) { wert -= Math.round((8 - stunde.temp) * 8); }
  if (stunde.temp > 30) { wert -= 30; gruende.push(`Temperatur ${stunde.temp}°C über 30°C`); }
  return { wert: Math.max(0, Math.min(100, wert)), gruende };
}

// Erste noch bevorstehende Risiko-Stunde am heutigen Tag (ab jetzt) —
// beantwortet "warum genau ist Betonage heute nicht möglich" mit einer
// konkreten Uhrzeit/Zeitspanne statt nur einer pauschalen Tageswarnung.
export function naechstesRisiko(stundenDaten) {
  if (!stundenDaten?.length) return null;
  const jetzt = new Date().getHours();
  for (const s of stundenDaten) {
    if (s.stunde < jetzt) continue;
    const { gruende } = betonageEignung(s);
    if (gruende.length > 0) {
      return { stunde: s.stunde, inStunden: s.stunde - jetzt, gruende };
    }
  }
  return null;
}

// Bestes zusammenhängendes Arbeitszeitfenster (Standard: 2 Stunden) für
// Betonage an einem Tag, gemittelt über den Eignungswert je Stunde.
export function besteZeitfenster(stundenDaten, fensterGroesse = 2) {
  const arbeitsstunden = (stundenDaten || []).filter(s => s.stunde >= 6 && s.stunde <= 18);
  let bestes = null;
  for (let i = 0; i <= arbeitsstunden.length - fensterGroesse; i++) {
    const fenster = arbeitsstunden.slice(i, i + fensterGroesse);
    const werte = fenster.map(s => betonageEignung(s).wert);
    const avg = werte.reduce((a, b) => a + b, 0) / werte.length;
    if (!bestes || avg > bestes.avg) {
      bestes = { start: fenster[0].stunde, ende: fenster[fenster.length - 1].stunde + 1, avg: Math.round(avg) };
    }
  }
  return bestes;
}

export async function getGPSPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS nicht verfügbar"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude,
        genauigkeit: Math.round(pos.coords.accuracy) }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "de" } }
    );
    const data = await res.json();
    const a = data.address || {};
    return [a.road, a.house_number, a.city || a.town || a.village]
      .filter(Boolean).join(" ");
  } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

export async function geocodePLZ(plz, ort = "") {
  if (!plz || !plz.trim()) return null;
  try {
    const params = new URLSearchParams({
      postalcode: plz.trim(),
      format: "json",
      limit: "1",
      countrycodes: "de,at,ch",
    });
    if (ort?.trim()) params.set("city", ort.trim());

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { "Accept-Language": "de" } }
    );
    const data = await res.json();
    if (data?.[0]) {
      return {
        lat:  parseFloat(data[0].lat),
        lon:  parseFloat(data[0].lon),
        name: ort?.trim() || data[0].display_name?.split(",")[0] || plz,
      };
    }
    return null;
  } catch { return null; }
}

// Distanz zwischen zwei Koordinaten in Metern (Haversine).
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export async function geocodeAdresse(adresse) {
  if (!adresse || !adresse.trim()) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(adresse)}&format=json&limit=1&countrycodes=de,at,ch`,
      { headers: { "Accept-Language": "de" } }
    );
    const data = await res.json();
    if (data?.[0]) {
      return {
        lat:  parseFloat(data[0].lat),
        lon:  parseFloat(data[0].lon),
        name: data[0].display_name?.split(",")[0] || adresse,
      };
    }
    return null;
  } catch { return null; }
}

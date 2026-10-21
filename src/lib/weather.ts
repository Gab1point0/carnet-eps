import type { ISODate } from '../types';

// Prévisions Open-Meteo (gratuit, sans clé, utilisable depuis le navigateur).
export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export interface Hour {
  /** `YYYY-MM-DDTHH:00`, heure de Paris. */
  time: string;
  temp: number;
  /** Probabilité de précipitations, 0–100. */
  prob: number;
  /** Précipitations en mm sur l'heure. */
  mm: number;
  /** Rafales de vent en km/h. */
  gust: number;
  /** Code météo WMO. */
  code: number;
}

export interface Risk {
  kind: 'rain' | 'storm' | 'snow' | 'wind' | 'heat' | 'cold';
  text: string;
}

/** Cherche une commune française par son nom (ou son code postal). */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&countryCode=FR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Recherche impossible');
  const json = (await res.json()) as { results?: Array<{ name: string; admin2?: string; admin1?: string; postcodes?: string[]; latitude: number; longitude: number }> };
  return (json.results ?? []).map((r) => ({
    label: [r.name, r.postcodes?.[0], r.admin2 ?? r.admin1].filter(Boolean).join(' · '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

const CACHE_KEY = 'carnet-eps:meteo';
const CACHE_MS = 60 * 60 * 1000;

/** Prévisions heure par heure sur les 4 prochains jours (mises en cache 1 h, hors ligne : dernière version connue). */
export async function fetchForecast(place: Place, now = Date.now()): Promise<Hour[]> {
  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  let cached: { key: string; at: number; hours: Hour[] } | null = null;
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    cached = null;
  }
  if (cached && cached.key === key && now - cached.at < CACHE_MS) return cached.hours;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      '&hourly=temperature_2m,precipitation_probability,precipitation,wind_gusts_10m,weather_code&timezone=Europe%2FParis&forecast_days=4';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Météo indisponible');
    const j = (await res.json()) as { hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; precipitation: number[]; wind_gusts_10m: number[]; weather_code: number[] } };
    const h = j.hourly;
    const hours: Hour[] = h.time.map((time, i) => ({
      time,
      temp: h.temperature_2m[i],
      prob: h.precipitation_probability[i] ?? 0,
      mm: h.precipitation[i] ?? 0,
      gust: h.wind_gusts_10m[i] ?? 0,
      code: h.weather_code[i] ?? 0,
    }));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: now, hours }));
    } catch {
      /* stockage indisponible */
    }
    return hours;
  } catch (e) {
    if (cached && cached.key === key) return cached.hours; // hors ligne : dernière prévision connue
    throw e;
  }
}

const hh = (t: string) => Number(t.slice(11, 13));

/**
 * Risques météo pendant une séance (de `start` à `end`, « HH:MM »), d'après les prévisions.
 * Liste vide : rien de gênant prévu (ou pas de prévision pour ce créneau).
 */
export function risksFor(hours: Hour[], date: ISODate, start: string, end: string): Risk[] {
  const from = Number(start.slice(0, 2));
  const to = Math.max(from, Number(end.slice(0, 2)) + (Number(end.slice(3, 5)) > 0 ? 0 : -1));
  const slot = hours.filter((x) => x.time.startsWith(date) && hh(x.time) >= from && hh(x.time) <= to);
  if (slot.length === 0) return [];
  const out: Risk[] = [];
  const prob = Math.max(...slot.map((x) => x.prob));
  const mm = slot.reduce((a, x) => a + x.mm, 0);
  const gust = Math.max(...slot.map((x) => x.gust));
  const tMax = Math.max(...slot.map((x) => x.temp));
  const tMin = Math.min(...slot.map((x) => x.temp));
  const codes = slot.map((x) => x.code);
  const storm = codes.some((c) => c >= 95);
  const snow = codes.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);
  const wet = codes.some((c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82));

  if (storm) out.push({ kind: 'storm', text: 'orage prévu' });
  else if (snow) out.push({ kind: 'snow', text: 'neige prévue' });
  else if ((prob >= 50 && mm >= 0.5) || mm >= 2 || (wet && prob >= 40)) out.push({ kind: 'rain', text: `pluie prévue (${prob} % de probabilité, ≈ ${Math.round(mm * 10) / 10} mm)` });
  if (gust >= 55) out.push({ kind: 'wind', text: `rafales jusqu'à ${Math.round(gust)} km/h` });
  if (tMax >= 32) out.push({ kind: 'heat', text: `forte chaleur (${Math.round(tMax)} °C) : prévoir de l'eau, de l'ombre et un effort réduit` });
  if (tMin <= 0) out.push({ kind: 'cold', text: `gel (${Math.round(tMin)} °C) : échauffement allongé, tenue chaude` });
  return out;
}

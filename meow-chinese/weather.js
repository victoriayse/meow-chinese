// Real weather where she is (Open-Meteo, free, no account). Uses this phone's location, asked once.
const ASK_KEY = 'meow-weather-ok';      // 'yes' | 'no' on this device
const CACHE_KEY = 'meow-weather';       // { at, kind, isDay, lat, lon }
const FRESH = 30 * 60000;               // look again every 30 minutes

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
export const asked = () => store.get(ASK_KEY);
export const allowed = () => store.get(ASK_KEY) === 'yes';
export function setAllowed(yes) { store.set(ASK_KEY, yes ? 'yes' : 'no'); if (!yes) store.set(CACHE_KEY, ''); }
export const supported = () => 'geolocation' in navigator;

// WMO weather codes → what we draw
export function kindOf(code) {
  if ([0, 1].includes(code)) return 'sun';
  if ([2, 3, 45, 48].includes(code)) return 'cloud';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloud';
}
export function cached() {
  try { const c = JSON.parse(store.get(CACHE_KEY) || 'null'); return c && Date.now() - c.at < 3 * 3600000 ? c : null; } catch { return null; }
}
export const current = () => (allowed() ? (cached() || {}).kind || null : null);

function position() {
  return new Promise((resolve, reject) => {
    if (!supported()) return reject(new Error('no location'));
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), (e) => reject(e), { enableHighAccuracy: false, timeout: 15000, maximumAge: 3 * 3600000 });
  });
}
// ask (must be from a tap the first time on iPhone), then fetch. Returns the kind or null.
export async function refresh(force = false) {
  if (!allowed()) return null;
  const c = cached();
  if (!force && c && Date.now() - c.at < FRESH) return c.kind;
  let lat = c && c.lat, lon = c && c.lon;
  try { const p = await position(); lat = Math.round(p.latitude * 100) / 100; lon = Math.round(p.longitude * 100) / 100; }
  catch (e) { if (e && e.code === 1) { setAllowed(false); return null; } if (lat == null) return null; }   // 1 = she said no
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,is_day&timezone=auto`);
    const j = await r.json();
    const kind = kindOf(Number(j.current && j.current.weather_code));
    store.set(CACHE_KEY, JSON.stringify({ at: Date.now(), kind, isDay: j.current && j.current.is_day, lat, lon }));
    return kind;
  } catch { return c ? c.kind : null; }
}

// falling rain / snow and lightning over the whole scene (behind the cards)
export function paintOverlay(kind) {
  let el = document.getElementById('wx');
  if (!kind || !['rain', 'storm', 'snow'].includes(kind)) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'wx'; el.setAttribute('aria-hidden', 'true'); document.getElementById('sky').after(el); }
  el.className = `wx-${kind}`;
}

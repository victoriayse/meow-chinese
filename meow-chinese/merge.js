// Three-way merge of two copies of the game (this device and the cloud), using the last copy both agreed on.
// Whatever changed on only one side is kept; coins and XP earned on both sides are added together;
// lists, essays and words are merged item by item, so nothing set up on one phone is lost on the other.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ADDITIVE = new Set(['coins', 'kitten.xp']);
const SKIP = new Set(['sync', 'updatedAt']);

function mergeArrays(anc, a, b, path, aNewer) {
  const hasIds = [...a, ...b].every((x) => isObj(x) && x.id != null);
  if (hasIds) {
    const byId = (arr) => new Map((arr || []).map((x) => [x.id, x]));
    const A = byId(a), B = byId(b), O = byId(anc);
    const order = [...a.map((x) => x.id), ...b.map((x) => x.id).filter((id) => !A.has(id))];
    const out = [];
    for (const id of order) {
      const x = A.get(id), y = B.get(id), o = O.get(id);
      if (x && y) out.push(merge3(o, x, y, path + '[]', aNewer));
      else if (x) { if (!(o && same(o, x))) out.push(x); }        // missing on the cloud: deleted there unless changed here
      else if (y) { if (!(o && same(o, y))) out.push(y); }        // missing here: deleted here unless changed on the cloud
    }
    return out;
  }
  // plain values (e.g. owned item ids) or records without ids: union, minus anything one side removed
  const key = (v) => JSON.stringify(v);
  const ancKeys = new Set((anc || []).map(key));
  const aKeys = new Set(a.map(key)), bKeys = new Set(b.map(key));
  const removed = new Set([...ancKeys].filter((k) => !aKeys.has(k) || !bKeys.has(k)));
  const seen = new Set(), out = [];
  for (const v of [...(aNewer ? a : b), ...(aNewer ? b : a)]) {
    const k = key(v);
    if (seen.has(k) || removed.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out;
}

export function merge3(anc, a, b, path = '', aNewer = true) {
  if (same(a, b)) return a;
  if (anc !== undefined) {
    if (same(a, anc)) return b;
    if (same(b, anc)) return a;
  }
  // both sides changed it
  if (typeof a === 'number' && typeof b === 'number') {
    if (ADDITIVE.has(path) && typeof anc === 'number') return Math.max(0, a + b - anc);
    return aNewer ? a : b;
  }
  if (Array.isArray(a) && Array.isArray(b)) return mergeArrays(Array.isArray(anc) ? anc : undefined, a, b, path, aNewer);
  if (isObj(a) && isObj(b)) {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!path && SKIP.has(k)) continue;
      const o = isObj(anc) ? anc[k] : undefined;
      const p = path ? `${path}.${k}` : k;
      if (!(k in b)) { if (o === undefined || !same(o, a[k])) out[k] = a[k]; continue; }
      if (!(k in a)) { if (o === undefined || !same(o, b[k])) out[k] = b[k]; continue; }
      out[k] = merge3(o, a[k], b[k], p, aNewer);
    }
    return out;
  }
  return aNewer ? a : b;
}

// a, b: whole saves. Returns the merged save.
export function mergeSaves(anc, local, remote) {
  const aNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);
  const out = merge3(anc, local, remote, '', aNewer);
  out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
  return out;
}
export const sameSave = (x, y) => {
  const strip = (s) => { const c = { ...s }; delete c.sync; delete c.updatedAt; return c; };
  return same(strip(x), strip(y));
};

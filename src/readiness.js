// Practice load → today's lift percentages, plus speed and jump tests. Pure math, no Node imports
// (the browser demo uses it too). Baked in from the football tech hit list, 2026-11-22.
//
// How the load flag works, in plain words:
//   - The coach brings in a practice's GPS numbers (a CSV from Pod Sideline, or typed): load, collisions, top speed.
//   - Each kid is compared with his own group (OL/DL or skill) at that same practice, so a light Thursday and a
//     heavy Tuesday both make sense, and linemen aren't flagged just for hitting more than receivers.
//     High  = load at least 1.25 x the team's middle value, or collisions at least 1.5 x the middle (and 4+ more than it).
//     Low   = load at most 0.6 x the middle (a light day, limited, or he barely practiced): "fresh".
//     Anything else is normal. A coach can set any kid's flag by hand and that wins.
//   - The next lift within 3 days uses his most recent practice: high drops every % set by `load_high_pts`
//     (default 10 points: 75% becomes 65%), low pushes it by `load_low_pts` (default 5). Fixed-pound and
//     kid-picks sets never change. Turn it off with load_adjust = off.

export const FLAGS = ['high', 'normal', 'low'];
export const LOOKBACK_DAYS = 3;

export function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** rows = one practice's [{ athlete_id, load, collisions, flag, manual, group }] → same rows with flag + why filled in.
 *  Kids are compared within their group (line or skill) when it has 3+ kids, so linemen aren't flagged just for being linemen. */
export function flagPractice(rows) {
  const mid = (list) => ({ load: median(list.map((r) => num(r.load))), hits: median(list.map((r) => num(r.collisions))) });
  const team = mid(rows);
  const groups = {};
  for (const r of rows) if (r.group) (groups[r.group] ||= []).push(r);
  const groupMid = Object.fromEntries(Object.entries(groups).filter(([, l]) => l.length >= 3).map(([g, l]) => [g, mid(l)]));
  return rows.map((r) => {
    if (r.manual && FLAGS.includes(r.flag)) return { ...r, why: 'set by coach' };
    const m = groupMid[r.group] || team;
    const who = groupMid[r.group] ? (r.group === 'line' ? 'OL/DL' : r.group) : 'team';
    const load = num(r.load), hits = num(r.collisions);
    if (hits != null && m.hits != null && m.hits > 0 && hits >= 1.5 * m.hits && hits >= m.hits + 4) return { ...r, flag: 'high', why: `${hits} collisions (${who} middle ${round1(m.hits)})` };
    if (load != null && m.load && load >= 1.25 * m.load) return { ...r, flag: 'high', why: `load ${Math.round(load)} (${who} middle ${Math.round(m.load)})` };
    if (load != null && m.load && load <= 0.6 * m.load) return { ...r, flag: 'low', why: `load ${Math.round(load)} (${who} middle ${Math.round(m.load)})` };
    return { ...r, flag: load == null && hits == null ? '' : 'normal', why: '' };
  });
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function dayDiff(a, b) {
  const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

/** The adjustment for one kid's lift day, from his most recent practice in the 3 days before it. */
export function adjustmentFor(practices, liftDay, settings = {}) {
  if (String(settings.load_adjust || 'on') === 'off') return null;
  const recent = practices.filter((p) => p.day < liftDay && dayDiff(p.day, liftDay) <= LOOKBACK_DAYS && p.flag).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  if (!recent || recent.flag === 'normal') return null;
  const pts = recent.flag === 'high' ? num(settings.load_high_pts) ?? -10 : num(settings.load_low_pts) ?? 5;
  if (!pts) return null;
  return { flag: recent.flag, pts, from_day: recent.day, why: recent.why || '', label: recent.flag === 'high' ? 'LIGHTER TODAY' : 'PUSH IT TODAY' };
}

/** Shift a % by the adjustment, kept between 30% and 95%. Null % (kid picks / fixed pounds) never changes. */
export function adjustPct(pct, adj) {
  if (pct == null || !adj) return pct;
  return Math.max(0.3, Math.min(0.95, Math.round((pct + adj.pts / 100) * 1000) / 1000));
}

// ---------- speed and jump tests ----------
// lower = a time (smaller is better); unit shows on the boards.
export const TESTS = [
  { key: 'top_speed', name: 'Top speed', short: 'TOP SPEED', unit: 'mph', lower: false, from: 'GPS pods' },
  { key: 'dash40', name: '40-yard dash', short: '40', unit: 's', lower: true },
  { key: 'dash10', name: '10-yard split', short: '10 SPLIT', unit: 's', lower: true },
  { key: 'shuttle', name: 'Pro agility (5-10-5)', short: 'SHUTTLE', unit: 's', lower: true },
  { key: 'vertical', name: 'Vertical jump', short: 'VERTICAL', unit: 'in', lower: false },
  { key: 'broad', name: 'Broad jump', short: 'BROAD', unit: 'in', lower: false },
];
export const TEST = Object.fromEntries(TESTS.map((t) => [t.key, t]));

/** Sanity limits so a typo (4.5 typed as 45) never tops a board. */
export function validTest(key, v) {
  const x = num(v);
  if (x == null) return false;
  const lim = LIMITS[key];
  return !!lim && x >= lim[0] && x <= lim[1];
}
const LIMITS = { top_speed: [8, 28], dash40: [3.9, 9], dash10: [1.3, 3], shuttle: [3.6, 7], vertical: [8, 48], broad: [48, 150] };
export const better = (key, a, b) => (TEST[key].lower ? a < b : a > b);

/** "8'4"" or "100" (inches) or "8-4" → inches for broad jump; anything else → number */
export function parseTestValue(key, raw) {
  const s = String(raw ?? '').trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!s) return null;
  if (key === 'broad' || key === 'vertical') {
    const m = s.match(/^(\d+)\s*['-]\s*(\d+(?:\.\d+)?)\s*"?$/);
    if (m) return +m[1] * 12 + +m[2];
  }
  if (key === 'top_speed' && /m\/s|mps/i.test(s)) return round1(parseFloat(s) * 2.23694);
  const x = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(x) ? x : null;
}

/** Strength vs speed: split a position group at its own middles into four boxes. */
export function strengthSpeed(points) {
  const mx = median(points.map((p) => p.speed)), my = median(points.map((p) => p.strength));
  const box = (p) => (p.strength >= my ? (p.speed >= mx ? 'both' : 'needs_speed') : p.speed >= mx ? 'needs_bar' : 'needs_both');
  return { mx, my, points: points.map((p) => ({ ...p, box: box(p) })) };
}

export const fmtTest = (key, v) => {
  if (v == null) return '';
  if ((key === 'broad') && v >= 24) return `${Math.floor(v / 12)}'${Math.round(v % 12)}"`;
  if (key === 'vertical') return `${round1(v)}"`;
  if (TEST[key]?.unit === 's') return v.toFixed(2);
  return `${round1(v)}`;
};

function num(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function round1(x) { return Math.round(x * 10) / 10; }

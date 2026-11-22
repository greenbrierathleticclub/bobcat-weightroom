// Roster import from a spreadsheet saved as CSV (Excel, Google Sheets, Numbers all do this).
// Header names are matched loosely so the coach's own sheet usually just works.
import { tx } from './tx.js';
import { today, classYear } from './store.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADERS = {
  first_name: ['first', 'first name', 'firstname', 'fname'],
  last_name: ['last', 'last name', 'lastname', 'lname', 'surname'],
  name: ['name', 'athlete', 'player', 'full name'],
  grad_year: ['grad', 'grad year', 'graduation', 'class of', 'year'],
  cls: ['class', 'grade', 'cls'],
  position: ['pos', 'position', 'positions'],
  group_tag: ['group', 'line/skill', 'unit'],
  bodyweight_lb: ['bw', 'bodyweight', 'body weight', 'weight', 'wt'],
  rack: ['rack', 'rack #', 'station'],
  squat: ['squat', 'back squat', 'sq'],
  bench: ['bench', 'bench press', 'bp'],
  clean: ['clean', 'power clean', 'hang clean', 'pc'],
};

function mapHeader(cells) {
  const map = {};
  cells.forEach((raw, i) => {
    const h = raw.toLowerCase().replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [key, names] of Object.entries(HEADERS)) {
      if (map[key] == null && names.includes(h)) map[key] = i;
    }
  });
  return map;
}

function gradFromClass(c, now = new Date()) {
  const k = String(c || '').toLowerCase().trim();
  const seniorsGrad = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const off = { sr: 0, senior: 0, '12': 0, jr: 1, junior: 1, '11': 1, so: 2, soph: 2, sophomore: 2, '10': 2, fr: 3, freshman: 3, '9': 3 }[k];
  return off == null ? null : seniorsGrad + off;
}

// Returns { added, updated, maxes, skipped: [reasons] }. dryRun = preview only.
export function importRoster(store, text, { dryRun = false } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { added: 0, updated: 0, maxes: 0, skipped: ['No data rows found'], preview: [] };
  const h = mapHeader(rows[0]);
  const hasName = h.name != null || (h.first_name != null && h.last_name != null);
  if (!hasName) return { added: 0, updated: 0, maxes: 0, skipped: ['Need a "First" and "Last" column, or one "Name" column'], preview: [] };

  const existing = store.athletes({ includeInactive: true });
  const key = (f, l) => `${f}|${l}`.toLowerCase();
  const byName = new Map(existing.map((a) => [key(a.first_name, a.last_name), a]));
  const result = { added: 0, updated: 0, maxes: 0, skipped: [], preview: [] };
  const day = today();
  const get = (r, k) => (h[k] != null ? String(r[h[k]] ?? '').trim() : '');

  const work = () => {
    rows.slice(1).forEach((r, idx) => {
      let first = get(r, 'first_name');
      let last = get(r, 'last_name');
      if ((!first || !last) && get(r, 'name')) {
        const n = get(r, 'name');
        if (n.includes(',')) [last, first] = n.split(',').map((x) => x.trim());
        else { const parts = n.split(/\s+/); first = parts.shift(); last = parts.join(' '); }
      }
      if (!first || !last) { result.skipped.push(`Row ${idx + 2}: no name`); return; }
      const grad = Number(get(r, 'grad_year')) || gradFromClass(get(r, 'cls')) || null;
      const groupRaw = get(r, 'group_tag').toLowerCase();
      const input = {
        first_name: first,
        last_name: last,
        grad_year: grad,
        position: get(r, 'position'),
        group_tag: /line|ol|dl/.test(groupRaw) ? 'line' : /skill/.test(groupRaw) ? 'skill' : null,
        bodyweight_lb: get(r, 'bodyweight_lb'),
        default_rack: get(r, 'rack').replace(/\D/g, ''),
      };
      const found = byName.get(key(first, last));
      const maxes = ['squat', 'bench', 'clean'].map((lift) => ({ lift, weight: Number(get(r, lift).replace(/[^\d.]/g, '')) })).filter((m) => m.weight > 0);
      result.preview.push({ name: `${first} ${last}`, cls: classYear(grad), position: input.position, bw: input.bodyweight_lb, action: found ? 'update' : 'add', maxes: maxes.map((m) => `${m.lift} ${m.weight}`).join(', ') });
      if (dryRun) { found ? result.updated++ : result.added++; result.maxes += maxes.length; return; }
      const saved = store.saveAthlete(found ? { ...found, ...stripEmpty(input), id: found.id, active: 1 } : input);
      found ? result.updated++ : result.added++;
      const toAdd = maxes.filter((m) => store.currentMax(saved.id, store.liftByKey(m.lift).id) !== m.weight)
        .map((m) => ({ athlete_id: saved.id, lift: m.lift, weight: m.weight }));
      if (toAdd.length) { store.addMaxes(toAdd, day, 'import'); result.maxes += toAdd.length; }
    });
  };
  if (dryRun) work(); else tx(store.db, work);
  return result;
}

function stripEmpty(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) out[k] = v;
  return out;
}

export function exportRosterCsv(store) {
  const lines = [['First', 'Last', 'Grad', 'Position', 'Group', 'Bodyweight', 'Rack', 'Squat', 'Bench', 'Clean']];
  for (const a of store.athletes()) {
    const m = store.currentMaxes(a.id);
    lines.push([a.first_name, a.last_name, a.grad_year ?? '', a.position ?? '', a.group, a.bodyweight_lb ?? '', a.default_rack ?? '', m.squat ?? '', m.bench ?? '', m.clean ?? '']);
  }
  return lines.map((l) => l.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}

// ---------- practice load and test results ----------
// The GPS pods' export (Catapult, STATSports, Polar, Pod Sideline...) all name columns a little differently,
// so columns are found by what they contain, not an exact name.
const LOOSE = {
  date: (h) => /^(date|day|session date|practice date|session)$/.test(h),
  load: (h) => /\bload\b|workload/.test(h) && !/\/\s*min|per min|rate/.test(h),
  collisions: (h) => /collision|impact|contact|\bhits?\b|tackles?/.test(h) && !/load/.test(h),
  top_speed: (h) => /(top|max|peak) ?(speed|velocity)|^vmax|^max vel/.test(h),
  flag: (h) => /^(flag|status|readiness)$/.test(h),
  dash40: (h) => /^(40|40 ?yd|40 ?yard( dash)?|forty|40 dash|40 time)$/.test(h),
  dash10: (h) => /^(10|10 ?yd|10 ?yard|10 split|10 ?yd split|10 yard split)$/.test(h),
  shuttle: (h) => /shuttle|pro agility|5 ?10 ?5|^agility$/.test(h),
  vertical: (h) => /^vert|vertical/.test(h),
  broad: (h) => /broad/.test(h),
};

function looseHeader(cells) {
  const map = mapHeader(cells);
  const units = {};
  cells.forEach((raw, i) => {
    const h = raw.toLowerCase().replace(/[_.]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const bare = h.replace(/\s*\(.*\)\s*$/, '').trim();
    for (const [key, test] of Object.entries(LOOSE)) {
      if (map[key] == null && (test(h) || test(bare))) { map[key] = i; units[key] = h; }
    }
    if (map.name == null && /^(player|athlete)( name)?$|^name$/.test(bare)) map.name = i;
  });
  return { map, units };
}

function parseDay(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d\d)-(\d\d)/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

// Finds a kid from a name cell: "First Last", "Last, First", or "F. Last" when the last name is unique.
export function nameMatcher(store) {
  const people = store.athletes({ includeInactive: true });
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
  const full = new Map(people.map((a) => [norm(`${a.first_name} ${a.last_name}`), a]));
  return (first, last, whole) => {
    if (whole && !first && !last) {
      const w = String(whole).replace(/^#?\d+\s+/, '');
      if (w.includes(',')) [last, first] = w.split(',').map((x) => x.trim());
      else { const parts = w.trim().split(/\s+/); first = parts.shift(); last = parts.join(' '); }
    }
    const hit = full.get(norm(`${first} ${last}`));
    if (hit) return hit;
    const sameLast = people.filter((a) => norm(a.last_name) === norm(last));
    const f = norm(first).replace(/\.$/, '');
    const byInitial = sameLast.filter((a) => f && norm(a.first_name).startsWith(f.slice(0, 1)));
    if (byInitial.length === 1) return byInitial[0];
    return null;
  };
}

const toMph = (v, unitHeader) => {
  if (v == null) return null;
  if (/m\/s|mps|metres per|meters per/.test(unitHeader || '')) return Math.round(v * 2.23694 * 10) / 10;
  if (/km/.test(unitHeader || '')) return Math.round(v * 0.621371 * 10) / 10;
  if (v > 0 && v < 13 && !/mph/.test(unitHeader || '')) return Math.round(v * 2.23694 * 10) / 10; // nobody tops out under 13 mph: it's m/s
  return v;
};

// Practice load CSV → { days: {day: rows}, matched, unmatched: [names], preview }. dryRun = preview only.
export function importPractice(store, text, { day = today(), dryRun = false } = {}) {
  const rows = parseCsv(text);
  const empty = { matched: 0, unmatched: [], days: [], preview: [], skipped: [] };
  if (rows.length < 2) return { ...empty, skipped: ['No data rows found'] };
  const { map: h, units } = looseHeader(rows[0]);
  if (h.name == null && (h.first_name == null || h.last_name == null)) return { ...empty, skipped: ['Need a player name column ("Name", "Player", or "First" + "Last")'] };
  if (h.load == null && h.collisions == null && h.top_speed == null && h.flag == null) return { ...empty, skipped: ['Need at least one of: load, collisions, top speed, flag'] };
  const find = nameMatcher(store);
  const get = (r, k) => (h[k] != null ? String(r[h[k]] ?? '').trim() : '');
  const num = (s) => { const x = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(x) ? x : null; };
  const byDay = new Map();
  const out = { ...empty, unmatched: [] };
  for (const r of rows.slice(1)) {
    const who = find(get(r, 'first_name'), get(r, 'last_name'), get(r, 'name'));
    const label = get(r, 'name') || `${get(r, 'first_name')} ${get(r, 'last_name')}`.trim();
    if (!who) { if (label && !/^(team|average|avg|total)/i.test(label)) out.unmatched.push(label); continue; }
    const d = parseDay(get(r, 'date')) || day;
    const flagRaw = get(r, 'flag').toLowerCase();
    const row = {
      athlete_id: who.id,
      load: num(get(r, 'load')),
      collisions: num(get(r, 'collisions')),
      top_speed_mph: toMph(num(get(r, 'top_speed')), units.top_speed),
      flag: /high|heavy|red|limit/.test(flagRaw) ? 'high' : /low|light|fresh|green/.test(flagRaw) ? 'low' : /normal|ok|yellow/.test(flagRaw) ? 'normal' : '',
    };
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(row);
    out.matched++;
    out.preview.push({ name: `${who.first_name} ${who.last_name}`, day: d, load: row.load, collisions: row.collisions, top_speed_mph: row.top_speed_mph, flag: row.flag });
  }
  out.days = [...byDay.keys()].sort();
  if (!dryRun) for (const [d, rs] of byDay) store.savePracticeDay(d, rs, 'import');
  return out;
}

// Test results CSV: a name column plus any of 40, 10 split, shuttle / pro agility, vertical, broad, top speed.
export function importTests(store, text, { day = today(), dryRun = false } = {}, parseValue) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { saved: 0, unmatched: [], bad: ['No data rows found'], preview: [] };
  const { map: h, units } = looseHeader(rows[0]);
  const keys = ['top_speed', 'dash40', 'dash10', 'shuttle', 'vertical', 'broad'].filter((k) => h[k] != null);
  if (!keys.length) return { saved: 0, unmatched: [], bad: ['No test columns found (40, 10 split, shuttle, vertical, broad, top speed)'], preview: [] };
  const find = nameMatcher(store);
  const get = (r, k) => (h[k] != null ? String(r[h[k]] ?? '').trim() : '');
  const entries = [];
  const out = { saved: 0, unmatched: [], bad: [], preview: [] };
  for (const r of rows.slice(1)) {
    const who = find(get(r, 'first_name'), get(r, 'last_name'), get(r, 'name'));
    const label = get(r, 'name') || `${get(r, 'first_name')} ${get(r, 'last_name')}`.trim();
    if (!who) { if (label) out.unmatched.push(label); continue; }
    for (const k of keys) {
      let v = parseValue(k, get(r, k));
      if (v == null) continue;
      if (k === 'top_speed') v = toMph(v, units.top_speed);
      entries.push({ athlete_id: who.id, test: k, value: v });
      out.preview.push({ name: `${who.first_name} ${who.last_name}`, test: k, value: v });
    }
  }
  if (dryRun) { out.saved = entries.length; return out; }
  const r = store.addTests(entries, day, 'import');
  return { ...out, saved: r.saved, bad: r.bad };
}

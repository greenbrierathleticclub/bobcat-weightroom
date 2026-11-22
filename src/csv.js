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

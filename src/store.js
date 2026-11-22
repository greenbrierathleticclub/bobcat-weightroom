// Everything the screens ask for, in plain SQL. No ORM, no magic.
import { tx } from './db.js';
import { e1rm, loadFromPct, beatYourLast, bodyweightScore } from './scoring.js';
import { parseScheme, schemeLabel } from './scheme.js';

const LINE_POSITIONS = new Set(['OL', 'DL', 'OT', 'OG', 'T', 'G', 'C', 'DT', 'DE', 'NT', 'NG', 'OLINE', 'DLINE']);

// Local calendar date (the Pi's time zone), YYYY-MM-DD.
export function today(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function classYear(gradYear, now = new Date()) {
  if (!gradYear) return '';
  const seniorsGrad = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const diff = gradYear - seniorsGrad;
  return ['Sr', 'Jr', 'So', 'Fr'][diff] || '';
}

const CLASS_LONG = { Sr: 'SENIOR', Jr: 'JUNIOR', So: 'SOPHOMORE', Fr: 'FRESHMAN' };

export function groupOf(a) {
  if (a.group_tag === 'line' || a.group_tag === 'skill') return a.group_tag;
  return LINE_POSITIONS.has(String(a.position || '').toUpperCase().trim()) ? 'line' : 'skill';
}

export class Store {
  constructor(db, { onChange } = {}) {
    this.db = db;
    this.onChange = onChange || (() => {});
  }

  q(sql) { return this.db.prepare(sql); }

  // ---------- settings ----------
  settings() {
    const out = {};
    for (const r of this.q('SELECT key, value FROM settings').all()) out[r.key] = r.value;
    return out;
  }
  saveSettings(patch) {
    const up = this.q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(patch || {})) up.run(k, String(v ?? ''));
    const n = Number(this.settings().rack_count) || 0;
    const have = this.q('SELECT COUNT(*) AS n FROM racks').get().n;
    for (let i = have + 1; i <= n; i++) this.q('INSERT INTO racks (id, name) VALUES (?, ?)').run(i, `Rack ${i}`);
    this.onChange('settings');
    return this.settings();
  }
  roundTo() { return Number(this.settings().round_to) || 5; }

  racks() { return this.q('SELECT id, name FROM racks ORDER BY id').all(); }
  lifts() { return this.q('SELECT * FROM lifts ORDER BY id').all(); }
  liftByKey(key) { return this.q('SELECT * FROM lifts WHERE key = ?').get(key); }
  liftById(id) { return this.q('SELECT * FROM lifts WHERE id = ?').get(id); }
  addLift({ key, name, short, has_max = 0, in_total = 0 }) {
    const k = String(key || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!k) throw httpError(400, 'Lift needs a name');
    this.q('INSERT OR IGNORE INTO lifts (key, name, short, has_max, in_total) VALUES (?, ?, ?, ?, ?)')
      .run(k, name || k, short || name || k, has_max ? 1 : 0, in_total ? 1 : 0);
    return this.liftByKey(k);
  }

  // ---------- athletes ----------
  decorate(a) {
    if (!a) return a;
    const cls = classYear(a.grad_year);
    return {
      ...a,
      display: `${a.first_name.charAt(0)}. ${a.last_name}`,
      full: `${a.first_name} ${a.last_name}`,
      initials: `${a.first_name.charAt(0)}${a.last_name.charAt(0)}`.toUpperCase(),
      cls,
      cls_long: CLASS_LONG[cls] || '',
      group: groupOf(a),
      photo_url: a.photo ? `/photos/${a.photo}` : null,
    };
  }
  athletes({ includeInactive = false } = {}) {
    const rows = this.q(`SELECT * FROM athletes ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY last_name, first_name`).all();
    return rows.map((a) => this.decorate(a));
  }
  athlete(id) { return this.decorate(this.q('SELECT * FROM athletes WHERE id = ?').get(id)); }

  saveAthlete(input) {
    const a = cleanAthlete(input);
    if (!a.first_name || !a.last_name) throw httpError(400, 'First and last name are required');
    let id = input.id;
    if (id) {
      this.q(`UPDATE athletes SET first_name=$first_name, last_name=$last_name, grad_year=$grad_year, position=$position,
              group_tag=$group_tag, bodyweight_lb=$bodyweight_lb, default_rack=$default_rack, active=$active WHERE id=$id`)
        .run({ ...prefix(a), $id: id });
    } else {
      id = Number(this.q(`INSERT INTO athletes (first_name, last_name, grad_year, position, group_tag, bodyweight_lb, default_rack, active)
              VALUES ($first_name, $last_name, $grad_year, $position, $group_tag, $bodyweight_lb, $default_rack, $active)`)
        .run(prefix(a)).lastInsertRowid);
    }
    this.onChange('athletes');
    return this.athlete(id);
  }

  setPhoto(id, file) {
    this.q('UPDATE athletes SET photo = ? WHERE id = ?').run(file, id);
    this.onChange('athletes');
  }

  // ---------- maxes ----------
  currentMax(athleteId, liftId) {
    const r = this.q('SELECT weight_lb, tested_on FROM maxes WHERE athlete_id = ? AND lift_id = ? ORDER BY tested_on DESC, id DESC LIMIT 1').get(athleteId, liftId);
    return r ? r.weight_lb : null;
  }
  currentMaxes(athleteId) {
    const out = {};
    for (const l of this.lifts()) out[l.key] = this.currentMax(athleteId, l.id);
    return out;
  }
  // entries: [{ athlete_id, lift (key), weight }]
  addMaxes(entries, testedOn = today(), source = 'tested') {
    const ins = this.q('INSERT INTO maxes (athlete_id, lift_id, weight_lb, tested_on, source) VALUES (?, ?, ?, ?, ?)');
    let n = 0;
    tx(this.db, () => {
      for (const e of entries || []) {
        const lift = this.liftByKey(e.lift);
        const w = Number(e.weight);
        if (!lift || !e.athlete_id || !(w > 0)) continue;
        ins.run(e.athlete_id, lift.id, w, testedOn, source);
        n++;
      }
    });
    this.onChange('maxes');
    return { saved: n };
  }
  maxHistory(athleteId) {
    return this.q(`SELECT m.id, l.key AS lift, m.weight_lb, m.tested_on, m.source FROM maxes m JOIN lifts l ON l.id = m.lift_id
                   WHERE m.athlete_id = ? ORDER BY m.tested_on DESC, m.id DESC`).all(athleteId);
  }
  deleteMax(id) { this.q('DELETE FROM maxes WHERE id = ?').run(id); this.onChange('maxes'); }

  // Best the kid has ever shown on a lift: max on file or any logged set, whichever is higher.
  bestEver(athleteId, liftId, beforeSetId = null) {
    const max = this.currentMax(athleteId, liftId) || 0;
    const r = this.q(`SELECT MAX(s.e1rm_lb) AS best FROM sets s JOIN sessions se ON se.id = s.session_id
                      WHERE se.athlete_id = ? AND se.lift_id = ? AND s.voided = 0 ${beforeSetId ? 'AND s.id < ?' : ''}`)
      .get(...[athleteId, liftId, ...(beforeSetId ? [beforeSetId] : [])]);
    return Math.max(max, r.best || 0);
  }

  // ---------- workouts ----------
  workout(day = today()) {
    const items = this.q(`SELECT w.*, l.key AS lift_key, l.name AS lift_name, l.short AS lift_short, l.has_max
                          FROM workout_items w JOIN lifts l ON l.id = w.lift_id WHERE w.day = ? ORDER BY w.seq, w.id`).all(day);
    return items.map((it) => {
      const parsed = parseScheme(it.scheme);
      return { ...it, sets: parsed.sets, errors: parsed.errors, label: schemeLabel(it.scheme) };
    });
  }
  // items: [{ lift (key), scheme, on_board, note }]
  saveWorkout(day, items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw httpError(400, 'Bad date');
    tx(this.db, () => {
      // Keep item ids that already have sessions so history stays linked.
      const used = new Set(this.q('SELECT DISTINCT workout_item_id AS id FROM sessions WHERE day = ?').all(day).map((r) => r.id));
      const existing = this.q('SELECT id FROM workout_items WHERE day = ?').all(day).map((r) => r.id);
      let boardSeen = false;
      const keep = new Set();
      (items || []).forEach((it, i) => {
        const lift = this.liftByKey(it.lift);
        if (!lift || !String(it.scheme || '').trim()) return;
        const onBoard = it.on_board && !boardSeen ? 1 : 0;
        if (onBoard) boardSeen = true;
        if (it.id && existing.includes(it.id)) {
          this.q('UPDATE workout_items SET seq=?, lift_id=?, scheme=?, on_board=?, note=? WHERE id=?')
            .run(i, lift.id, String(it.scheme).trim(), onBoard, it.note || null, it.id);
          keep.add(it.id);
        } else {
          const id = Number(this.q('INSERT INTO workout_items (day, seq, lift_id, scheme, on_board, note) VALUES (?, ?, ?, ?, ?, ?)')
            .run(day, i, lift.id, String(it.scheme).trim(), onBoard, it.note || null).lastInsertRowid);
          keep.add(id);
        }
      });
      for (const id of existing) {
        if (keep.has(id)) continue;
        if (used.has(id)) this.q('UPDATE workout_items SET seq = 999 WHERE id = ?').run(id); // orphaned but kept
        else this.q('DELETE FROM workout_items WHERE id = ?').run(id);
      }
      // No board lift picked: the first lift with a max gets it.
      if (!boardSeen) {
        const first = this.q(`SELECT w.id FROM workout_items w JOIN lifts l ON l.id = w.lift_id
                              WHERE w.day = ? AND w.seq < 999 AND l.has_max = 1 ORDER BY w.seq LIMIT 1`).get(day);
        if (first) this.q('UPDATE workout_items SET on_board = 1 WHERE id = ?').run(first.id);
      }
    });
    this.onChange('workout');
    return this.workout(day).filter((w) => w.seq < 999);
  }
  copyWorkout(fromDay, toDay) {
    const items = this.workout(fromDay).filter((w) => w.seq < 999)
      .map((w) => ({ lift: w.lift_key, scheme: w.scheme, on_board: w.on_board, note: w.note }));
    return this.saveWorkout(toDay, items);
  }
  recentWorkoutDays(limit = 30) {
    return this.q(`SELECT day, GROUP_CONCAT(l.short, ' · ') AS lifts FROM workout_items w JOIN lifts l ON l.id = w.lift_id
                   WHERE w.seq < 999 GROUP BY day ORDER BY day DESC LIMIT ?`).all(limit);
  }

  // Weights for each set for one kid: % of his max, rounded down to the plate step.
  plan(athleteId, item) {
    const max = item.has_max ? this.currentMax(athleteId, item.lift_id) : null;
    const step = this.roundTo();
    return item.sets.map((s, i) => ({
      n: i + 1,
      reps: s.reps,
      amrap: s.amrap,
      pct: s.pct,
      weight: s.lb != null ? s.lb : s.pct != null ? loadFromPct(max, s.pct, step) : null,
    }));
  }

  // ---------- rack ----------
  rackState(rackId, day = today()) {
    const rack = this.q('SELECT * FROM racks WHERE id = ?').get(rackId);
    if (!rack) throw httpError(404, 'No such rack');
    const items = this.workout(day).filter((w) => w.seq < 999);
    const first = items[0] || null;
    const crew = this.athletes().filter((a) => a.default_rack === rack.id).map((a) => this.crewCard(a, first, day));
    return {
      rack,
      day,
      settings: this.settings(),
      items: items.map(publicItem),
      crew,
    };
  }
  // What a kid's tile shows: the first lift he hasn't touched today and his weight for its first set.
  crewCard(a, firstItem, day = today()) {
    const items = this.workout(day).filter((w) => w.seq < 999);
    const touched = new Set(this.q(`SELECT DISTINCT se.workout_item_id AS id FROM sessions se JOIN sets s ON s.session_id = se.id
                                    WHERE se.athlete_id = ? AND se.day = ? AND s.voided = 0`).all(a.id, day).map((r) => r.id));
    const item = items.find((w) => !touched.has(w.id)) || firstItem || items[0] || null;
    const plan = item ? this.plan(a.id, item) : [];
    const max = item && item.has_max ? this.currentMax(a.id, item.lift_id) : null;
    return { ...pickAthlete(a), item_id: item ? item.id : null, item_lift: item ? item.lift_short : null, item_label: item ? item.label : null,
      first_weight: plan[0] ? plan[0].weight : null, first_pct: plan[0] ? plan[0].pct : null, max, all_done: items.length > 0 && items.every((w) => touched.has(w.id)) };
  }
  athleteCard(athleteId, day = today()) {
    const a = this.athlete(athleteId);
    if (!a) throw httpError(404, 'No such athlete');
    return this.crewCard(a, null, day);
  }
  item(id) {
    const it = this.q(`SELECT w.*, l.key AS lift_key, l.name AS lift_name, l.short AS lift_short, l.has_max
                       FROM workout_items w JOIN lifts l ON l.id = w.lift_id WHERE w.id = ?`).get(id);
    if (!it) return null;
    const parsed = parseScheme(it.scheme);
    return { ...it, sets: parsed.sets, errors: parsed.errors, label: schemeLabel(it.scheme) };
  }

  // The kid's most recent earlier day on this lift: best set and its estimated max.
  lastTime(athleteId, liftId, beforeDay) {
    const r = this.q(`SELECT se.day, s.weight_lb, s.reps, s.e1rm_lb FROM sets s JOIN sessions se ON se.id = s.session_id
                      WHERE se.athlete_id = ? AND se.lift_id = ? AND se.day < ? AND s.voided = 0
                      ORDER BY se.day DESC, s.e1rm_lb DESC LIMIT 1`).get(athleteId, liftId, beforeDay);
    return r ? { day: r.day, weight: r.weight_lb, reps: r.reps, e1rm: r.e1rm_lb } : null;
  }
  bestToday(athleteId, liftId, day) {
    const r = this.q(`SELECT s.weight_lb, s.reps, s.e1rm_lb FROM sets s JOIN sessions se ON se.id = s.session_id
                      WHERE se.athlete_id = ? AND se.lift_id = ? AND se.day = ? AND s.voided = 0
                      ORDER BY s.e1rm_lb DESC, s.id LIMIT 1`).get(athleteId, liftId, day);
    return r ? { weight: r.weight_lb, reps: r.reps, e1rm: r.e1rm_lb } : null;
  }

  startSession({ athlete_id, rack_id, item_id }, { view = true } = {}) {
    const a = this.athlete(athlete_id);
    const item = this.item(item_id);
    if (!a || !item) throw httpError(400, 'Need an athlete and a workout item');
    // Same kid, same lift, same day: pick up where he left off instead of starting over.
    let s = this.q('SELECT * FROM sessions WHERE athlete_id = ? AND workout_item_id = ? AND day = ? ORDER BY id DESC LIMIT 1')
      .get(a.id, item.id, item.day);
    if (!s) {
      const id = Number(this.q('INSERT INTO sessions (athlete_id, rack_id, workout_item_id, lift_id, day) VALUES (?, ?, ?, ?, ?)')
        .run(a.id, rack_id || null, item.id, item.lift_id, item.day).lastInsertRowid);
      s = { id };
    } else {
      this.q('UPDATE sessions SET ended_at = NULL, rack_id = ? WHERE id = ?').run(rack_id || null, s.id);
    }
    return view ? this.sessionView(s.id) : { id: s.id };
  }

  session(id) { return this.q('SELECT * FROM sessions WHERE id = ?').get(id); }

  sessionView(id) {
    const s = this.session(id);
    if (!s) throw httpError(404, 'No such session');
    const a = this.athlete(s.athlete_id);
    const item = s.workout_item_id ? this.item(s.workout_item_id) : null;
    const lift = this.liftById(s.lift_id);
    const sets = this.q('SELECT id, seq, weight_lb AS weight, reps, e1rm_lb AS e1rm, is_pr FROM sets WHERE session_id = ? AND voided = 0 ORDER BY seq, id').all(s.id);
    const plan = item ? this.plan(a.id, item) : [];
    const last = this.lastTime(a.id, s.lift_id, s.day);
    const best = this.bestToday(a.id, s.lift_id, s.day);
    const pct = best && last ? beatYourLast(best.e1rm, last.e1rm) : null;
    const items = this.workout(s.day).filter((w) => w.seq < 999);
    const idx = items.findIndex((w) => w.id === s.workout_item_id);
    const next = idx >= 0 ? items[idx + 1] || null : null;
    return {
      id: s.id,
      day: s.day,
      athlete: pickAthlete(a),
      lift: { key: lift.key, name: lift.name, short: lift.short, has_max: lift.has_max },
      item: item ? publicItem(item) : null,
      max: lift.has_max ? this.currentMax(a.id, lift.id) : null,
      plan,
      sets,
      last,
      best,
      beat_pct: pct,
      rank: pct != null ? this.rankToday(s.lift_id, s.day, a.id) : null,
      next: next ? { ...publicItem(next), first_weight: (this.plan(a.id, next)[0] || {}).weight ?? null } : null,
    };
  }

  logSet(sessionId, { weight, reps }, { view = true } = {}) {
    const s = this.session(sessionId);
    if (!s) throw httpError(404, 'No such session');
    const w = Number(weight);
    const r = Math.round(Number(reps));
    if (!(w > 0) || w > 1500) throw httpError(400, 'Weight looks wrong');
    if (!(r >= 1) || r > 50) throw httpError(400, 'Reps look wrong');
    const est = Math.round(e1rm(w, r) * 10) / 10;
    const prevBest = this.bestEver(s.athlete_id, s.lift_id);
    const isPr = prevBest > 0 && est > prevBest ? 1 : 0;
    const seq = this.q('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM sets WHERE session_id = ?').get(s.id).n;
    const id = Number(this.q('INSERT INTO sets (session_id, seq, weight_lb, reps, e1rm_lb, is_pr, prev_best_lb) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(s.id, seq, w, r, est, isPr, isPr ? prevBest : null).lastInsertRowid);
    this.onChange('sets');
    return { set_id: id, is_pr: !!isPr, pr: isPr ? { e1rm: est, prev: prevBest, gain: Math.round(est - prevBest), single: r === 1 } : null, session: view ? this.sessionView(s.id) : null };
  }

  undoLastSet(sessionId) {
    const last = this.q('SELECT id FROM sets WHERE session_id = ? AND voided = 0 ORDER BY seq DESC, id DESC LIMIT 1').get(sessionId);
    if (last) { this.q('UPDATE sets SET voided = 1 WHERE id = ?').run(last.id); this.onChange('sets'); }
    return this.sessionView(sessionId);
  }

  endSession(sessionId) {
    this.q("UPDATE sessions SET ended_at = datetime('now','localtime') WHERE id = ?").run(sessionId);
    this.onChange('sessions');
    return { ok: true };
  }

  // Coach log: every set on a day, newest first.
  setsForDay(day = today()) {
    return this.q(`SELECT s.id, s.seq, s.weight_lb AS weight, s.reps, s.e1rm_lb AS e1rm, s.is_pr, s.voided, s.created_at,
                          a.first_name, a.last_name, l.short AS lift, r.name AS rack
                   FROM sets s JOIN sessions se ON se.id = s.session_id JOIN athletes a ON a.id = se.athlete_id
                   JOIN lifts l ON l.id = se.lift_id LEFT JOIN racks r ON r.id = se.rack_id
                   WHERE se.day = ? ORDER BY s.id DESC`).all(day);
  }
  voidSet(id, voided = true) {
    this.q('UPDATE sets SET voided = ? WHERE id = ?').run(voided ? 1 : 0, id);
    this.onChange('sets');
    return { ok: true };
  }
  history(athleteId) {
    return this.q(`SELECT se.day, l.short AS lift, s.weight_lb AS weight, s.reps, s.e1rm_lb AS e1rm, s.is_pr
                   FROM sets s JOIN sessions se ON se.id = s.session_id JOIN lifts l ON l.id = se.lift_id
                   WHERE se.athlete_id = ? AND s.voided = 0 ORDER BY se.day DESC, s.seq`).all(athleteId);
  }

  // ---------- boards ----------
  beatRows(liftId, day) {
    const rows = this.q(`SELECT DISTINCT se.athlete_id FROM sessions se JOIN sets s ON s.session_id = se.id
                         WHERE se.lift_id = ? AND se.day = ? AND s.voided = 0`).all(liftId, day);
    const out = [];
    for (const { athlete_id } of rows) {
      const best = this.bestToday(athlete_id, liftId, day);
      const last = this.lastTime(athlete_id, liftId, day);
      if (!best || !last) continue;
      out.push({ athlete_id, best, last, pct: beatYourLast(best.e1rm, last.e1rm) });
    }
    out.sort((x, y) => y.pct - x.pct || y.best.e1rm - x.best.e1rm);
    return out;
  }
  rankToday(liftId, day, athleteId) {
    const rows = this.beatRows(liftId, day);
    const i = rows.findIndex((r) => r.athlete_id === athleteId);
    return i >= 0 ? i + 1 : null;
  }

  todayBoard(day = today(), limit = 7) {
    const items = this.workout(day).filter((w) => w.seq < 999);
    const board = items.find((w) => w.on_board) || null;
    const rows = board ? this.beatRows(board.lift_id, day).slice(0, limit).map((r) => ({
      athlete: pickAthlete(this.athlete(r.athlete_id)),
      last: r.last, best: r.best, pct: r.pct,
    })) : [];
    const prs = this.q(`SELECT s.id, s.weight_lb AS weight, s.reps, s.e1rm_lb AS e1rm, s.prev_best_lb AS prev, se.athlete_id, l.short AS lift
                        FROM sets s JOIN sessions se ON se.id = s.session_id JOIN lifts l ON l.id = se.lift_id
                        WHERE se.day = ? AND s.is_pr = 1 AND s.voided = 0 ORDER BY s.id DESC`).all(day);
    // One line per kid per lift: his best PR of the day.
    const seen = new Map();
    for (const p of prs) {
      const k = `${p.athlete_id}:${p.lift}`;
      if (!seen.has(k) || seen.get(k).e1rm < p.e1rm) seen.set(k, p);
    }
    const prList = [...seen.values()].sort((x, y) => y.id - x.id).slice(0, 6).map((p) => ({
      athlete: pickAthlete(this.athlete(p.athlete_id)), lift: p.lift, e1rm: Math.round(p.e1rm), gain: Math.round(p.e1rm - (p.prev || 0)),
    }));
    return { day, items: items.map(publicItem), board: board ? publicItem(board) : null, rows, prs: prList };
  }

  seasonBoard(limit = 7) {
    const settings = this.settings();
    const totalLifts = this.lifts().filter((l) => l.in_total);
    const start = settings.season_start || '0000-00-00';
    const people = [];
    for (const a of this.athletes()) {
      const cur = {};
      const base = {};
      for (const l of totalLifts) {
        const c = this.q('SELECT weight_lb FROM maxes WHERE athlete_id = ? AND lift_id = ? ORDER BY tested_on DESC, id DESC LIMIT 1').get(a.id, l.id);
        const b = this.q('SELECT weight_lb FROM maxes WHERE athlete_id = ? AND lift_id = ? AND tested_on >= ? ORDER BY tested_on ASC, id ASC LIMIT 1').get(a.id, l.id, start);
        cur[l.key] = c ? c.weight_lb : null;
        base[l.key] = b ? b.weight_lb : null;
      }
      const complete = totalLifts.every((l) => cur[l.key]);
      if (!complete) continue;
      const total = totalLifts.reduce((t, l) => t + cur[l.key], 0);
      const baseComplete = totalLifts.every((l) => base[l.key]);
      const baseTotal = baseComplete ? totalLifts.reduce((t, l) => t + base[l.key], 0) : null;
      people.push({
        athlete: pickAthlete(a),
        group: a.group,
        lifts: totalLifts.map((l) => cur[l.key]),
        total,
        bw: a.bodyweight_lb || null,
        score: a.bodyweight_lb ? bodyweightScore(total, a.bodyweight_lb) : null,
        base_total: baseTotal,
        improve: baseTotal && baseTotal !== total ? (total - baseTotal) / baseTotal : null,
      });
    }
    const by = (f) => (x, y) => f(y) - f(x);
    return {
      lift_names: totalLifts.map((l) => l.short),
      best_overall: people.filter((p) => p.score).sort(by((p) => p.score)).slice(0, limit),
      strongest_line: people.filter((p) => p.group === 'line').sort(by((p) => p.total)).slice(0, 3),
      strongest_skill: people.filter((p) => p.group === 'skill').sort(by((p) => p.total)).slice(0, 3),
      most_improved: people.filter((p) => p.improve > 0).sort(by((p) => p.improve)).slice(0, limit),
    };
  }
}

// ---------- helpers ----------
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function pickAthlete(a) {
  return { id: a.id, display: a.display, full: a.full, initials: a.initials, position: a.position || '', cls: a.cls, cls_long: a.cls_long, photo_url: a.photo_url, group: a.group };
}
function publicItem(it) {
  return { id: it.id, lift_key: it.lift_key, lift_name: it.lift_name, lift_short: it.lift_short, has_max: it.has_max, scheme: it.scheme, label: it.label, on_board: !!it.on_board, note: it.note, sets: it.sets };
}
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function cleanAthlete(i) {
  return {
    first_name: String(i.first_name || '').trim(),
    last_name: String(i.last_name || '').trim(),
    grad_year: numOrNull(i.grad_year),
    position: String(i.position || '').trim().toUpperCase() || null,
    group_tag: i.group_tag === 'line' || i.group_tag === 'skill' ? i.group_tag : null,
    bodyweight_lb: numOrNull(i.bodyweight_lb),
    default_rack: numOrNull(i.default_rack),
    active: i.active === false || i.active === 0 || i.active === '0' ? 0 : 1,
  };
}
function prefix(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[`$${k}`] = v;
  return out;
}

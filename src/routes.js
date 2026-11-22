// Every API route in one list. No Node imports: the server uses it, and so does the browser demo.
import { today } from './store.js';
import { importRoster, exportRosterCsv, importPractice, importTests } from './csv.js';
import { parseTestValue } from './readiness.js';

export function buildRoutes({ store, backups, savePhoto, backupFile }) {
  // [method, pattern, handler, coachOnly]
  return [
    ['GET', '/api/rack/:id', (p, q) => store.rackState(Number(p.id), q.get('day') || today())],
    ['GET', '/api/athletes', () => store.athletes().map((a) => ({ id: a.id, display: a.display, full: a.full, initials: a.initials, position: a.position, cls: a.cls, photo_url: a.photo_url, last_name: a.last_name, first_name: a.first_name }))],
    ['GET', '/api/athletes/:id/card', (p, q) => store.athleteCard(Number(p.id), q.get('day') || today())],
    ['POST', '/api/sessions', (p, q, b) => store.startSession(b)],
    ['GET', '/api/sessions/:id', (p) => store.sessionView(Number(p.id))],
    ['POST', '/api/sessions/:id/sets', (p, q, b) => store.logSet(Number(p.id), b)],
    ['POST', '/api/sessions/:id/undo', (p) => store.undoLastSet(Number(p.id))],
    ['POST', '/api/sessions/:id/end', (p) => store.endSession(Number(p.id))],
    ['GET', '/api/board/today', (p, q) => store.todayBoard(q.get('day') || today())],
    ['GET', '/api/board/season', () => store.seasonBoard()],
    ['GET', '/api/board/speed', (p, q) => store.speedBoard(5, q.get('day') || today())],
    ['GET', '/api/settings', () => store.settings()],
    ['GET', '/api/time', () => ({ now: Date.now(), day: today() })],

    // Coach
    ['GET', '/api/coach/check', () => ({ ok: true }), true],
    ['GET', '/api/coach/athletes', () => store.athletes({ includeInactive: true }).map((a) => ({ ...a, maxes: store.currentMaxes(a.id) })), true],
    ['POST', '/api/coach/athletes', (p, q, b) => store.saveAthlete(b), true],
    ['GET', '/api/coach/athletes/:id', (p) => ({ ...store.athlete(Number(p.id)), maxes: store.maxHistory(Number(p.id)), history: store.history(Number(p.id)) }), true],
    ['POST', '/api/coach/athletes/:id/photo', (p, q, b) => savePhoto(Number(p.id), b), true],
    ['POST', '/api/coach/import', (p, q, b) => importRoster(store, b.csv, { dryRun: !!b.dry_run }), true],
    ['GET', '/api/coach/export.csv', () => ({ __raw: exportRosterCsv(store), type: 'text/csv; charset=utf-8', file: `roster-${today()}.csv` }), true],
    ['POST', '/api/coach/maxes', (p, q, b) => store.addMaxes(b.entries, b.tested_on || today(), 'tested'), true],
    ['DELETE', '/api/coach/maxes/:id', (p) => store.deleteMax(Number(p.id)) || { ok: true }, true],
    ['GET', '/api/coach/workout', (p, q) => ({ day: q.get('day') || today(), items: store.workout(q.get('day') || today()).filter((w) => w.seq < 999), recent: store.recentWorkoutDays(), lifts: store.lifts() }), true],
    ['POST', '/api/coach/workout', (p, q, b) => store.saveWorkout(b.day, b.items), true],
    ['POST', '/api/coach/workout/copy', (p, q, b) => store.copyWorkout(b.from, b.to), true],
    ['POST', '/api/coach/lifts', (p, q, b) => store.addLift(b), true],
    ['GET', '/api/coach/sets', (p, q) => store.setsForDay(q.get('day') || today()), true],
    ['POST', '/api/coach/sets/:id/void', (p, q, b) => store.voidSet(Number(p.id), b.voided !== false), true],
    ['GET', '/api/coach/practice', (p, q) => store.practiceDay(q.get('day') || today()), true],
    ['POST', '/api/coach/practice/import', (p, q, b) => importPractice(store, b.csv, { day: b.day || today(), dryRun: !!b.dry_run }), true],
    ['POST', '/api/coach/practice', (p, q, b) => store.savePracticeDay(b.day, b.rows || [], 'coach'), true],
    ['POST', '/api/coach/practice/flag', (p, q, b) => store.setPracticeFlag(Number(b.athlete_id), b.day, b.flag), true],
    ['POST', '/api/coach/practice/clear', (p, q, b) => store.clearPracticeDay(b.day), true],
    ['GET', '/api/coach/tests', () => { const best = store.bestTests(); return store.athletes().map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, position: a.position, group: a.group, best: best.get(a.id) || {} })); }, true],
    ['POST', '/api/coach/tests', (p, q, b) => store.addTests((b.entries || []).map((e) => ({ ...e, value: parseTestValue(e.test, e.value) })), b.day || today(), 'coach'), true],
    ['POST', '/api/coach/tests/import', (p, q, b) => importTests(store, b.csv, { day: b.day || today(), dryRun: !!b.dry_run }, parseTestValue), true],
    ['GET', '/api/coach/tests/:athlete', (p) => store.testHistory(Number(p.athlete)), true],
    ['DELETE', '/api/coach/tests/:id', (p) => store.deleteTest(Number(p.id)) || { ok: true }, true],
    ['GET', '/api/coach/strength-speed', () => store.strengthVsSpeed(), true],
    ['POST', '/api/coach/settings', (p, q, b) => store.saveSettings(b), true],
    ['GET', '/api/coach/backups', () => backups.status(), true],
    ['POST', '/api/coach/backups', () => backups.run('manual'), true],
    ['GET', '/api/coach/backups/:file', (p) => backupFile(p.file), true],
  ].map(([method, path, fn, coach]) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    return { method, re, keys, fn, coach };
  });
}

export function matchRoute(routes, method, path) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

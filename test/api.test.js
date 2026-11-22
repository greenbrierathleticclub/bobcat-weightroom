import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { today } from '../src/store.js';

let app;
let base;
const dir = mkdtempSync(join(tmpdir(), 'bobcat-test-'));

async function call(path, body, method) {
  const res = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

before(async () => {
  app = createApp({ dataDir: dir, log: () => {} });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => app.close());

const day = today();
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 2); return today(d); })();

test('roster import from a spreadsheet, then re-import updates instead of duplicating', async () => {
  const csv = 'First,Last,Grad,Position,Bodyweight,Rack,Squat,Bench,Clean\nDerek,Holt,2027,OL,265,1,365,250,235\n"Mercer, Tim",,,,,,,,\nNate,Pruitt,2029,QB,180,1,300,205,185\n';
  const dry = await call('/api/coach/import', { csv, dry_run: true });
  assert.equal(dry.data.added, 2);
  assert.equal(dry.data.skipped.length, 1);
  const real = await call('/api/coach/import', { csv });
  assert.equal(real.data.added, 2);
  assert.equal(real.data.maxes, 6);
  const again = await call('/api/coach/import', { csv });
  assert.equal(again.data.added, 0);
  assert.equal(again.data.updated, 2);
  assert.equal(again.data.maxes, 0, 'unchanged maxes are not re-saved');
  const people = await call('/api/coach/athletes');
  assert.equal(people.data.length, 2);
  assert.equal(people.data.find((a) => a.last_name === 'Holt').group, 'line');
});

test('workout as % of max, rounded down to 5', async () => {
  const saved = await call('/api/coach/workout', { day, items: [{ lift: 'squat', scheme: '5x3@75', on_board: true }, { lift: 'bench', scheme: '3@65, 3+@85' }] });
  assert.equal(saved.status, 200);
  const rack = await call('/api/rack/1');
  assert.equal(rack.data.items.length, 2);
  const holt = rack.data.crew.find((a) => a.display === 'D. Holt');
  assert.equal(holt.first_weight, 270); // 365 * .75 = 273.75 -> 270
});

test('beat your last, rank, PR, and maxes never move on their own', async () => {
  // Last time: Holt 270x3, Pruitt 225x3.
  await call('/api/coach/workout', { day: yesterday, items: [{ lift: 'squat', scheme: '5x3@75', on_board: true }] });
  const old = (await call(`/api/coach/workout?day=${yesterday}`)).data.items[0];
  const people = (await call('/api/coach/athletes')).data;
  const holt = people.find((a) => a.last_name === 'Holt');
  const pruitt = people.find((a) => a.last_name === 'Pruitt');
  for (const [a, w] of [[holt, 270], [pruitt, 225]]) {
    const s = (await call('/api/sessions', { athlete_id: a.id, rack_id: 1, item_id: old.id })).data;
    await call(`/api/sessions/${s.id}/sets`, { weight: w, reps: 3 });
  }
  // Sessions are stamped today; move yesterday's to yesterday like real life.
  app.db.prepare('UPDATE sessions SET day = ? WHERE workout_item_id = ?').run(yesterday, old.id);

  const item = (await call('/api/rack/1')).data.items[0];
  const hs = (await call('/api/sessions', { athlete_id: holt.id, rack_id: 1, item_id: item.id })).data;
  assert.equal(hs.plan.length, 5);
  assert.equal(hs.last.weight, 270);
  let r = await call(`/api/sessions/${hs.id}/sets`, { weight: 270, reps: 5 });
  assert.equal(r.data.is_pr, false);
  assert.ok(r.data.session.beat_pct > 0.05);
  assert.equal(r.data.session.rank, 1);

  const ps = (await call('/api/sessions', { athlete_id: pruitt.id, rack_id: 1, item_id: item.id })).data;
  r = await call(`/api/sessions/${ps.id}/sets`, { weight: 300, reps: 3 }); // e1rm 330 > max 300: PR
  assert.equal(r.data.is_pr, true);
  assert.equal(r.data.pr.prev, 300);
  assert.equal(r.data.pr.gain, 30);
  assert.equal(r.data.session.rank, 1);

  const board = (await call('/api/board/today')).data;
  assert.equal(board.rows[0].athlete.display, 'N. Pruitt');
  assert.equal(board.prs.length, 1);

  // Kevin's rule: only max day changes a max.
  const after = (await call('/api/coach/athletes')).data.find((a) => a.id === pruitt.id);
  assert.equal(after.maxes.squat, 300);

  // Coach strikes the bogus set: PR and rank go away.
  const sets = (await call(`/api/coach/sets?day=${day}`)).data;
  const bogus = sets.find((x) => x.last_name === 'Pruitt' && x.is_pr);
  await call(`/api/coach/sets/${bogus.id}/void`, { voided: true });
  const board2 = (await call('/api/board/today')).data;
  assert.equal(board2.prs.length, 0);
  assert.equal(board2.rows[0].athlete.display, 'D. Holt');
});

test('max day changes maxes and the season board', async () => {
  const people = (await call('/api/coach/athletes')).data;
  const holt = people.find((a) => a.last_name === 'Holt');
  await call('/api/coach/maxes', { tested_on: day, entries: [{ athlete_id: holt.id, lift: 'squat', weight: 385 }] });
  const season = (await call('/api/board/season')).data;
  const h = season.strongest_line.find((p) => p.athlete.id === holt.id);
  assert.equal(h.total, 385 + 250 + 235);
  assert.equal(season.best_overall.length, 2);
});

test('bad input is refused', async () => {
  const item = (await call('/api/rack/1')).data.items[0];
  const s = (await call('/api/sessions', { athlete_id: 1, rack_id: 1, item_id: item.id })).data;
  assert.equal((await call(`/api/sessions/${s.id}/sets`, { weight: 0, reps: 3 })).status, 400);
  assert.equal((await call(`/api/sessions/${s.id}/sets`, { weight: 200, reps: 99 })).status, 400);
});

test('backup writes a copy', async () => {
  const r = (await call('/api/coach/backups', {})).data;
  assert.equal(r.ok, true);
  assert.ok(existsSync(r.file));
});

test('coach PIN locks the coach API when set', async () => {
  const locked = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'bobcat-pin-')), coachPin: '4321', log: () => {} });
  await new Promise((r) => locked.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${locked.server.address().port}`;
  assert.equal((await fetch(`${url}/api/coach/athletes`)).status, 401);
  assert.equal((await fetch(`${url}/api/rack/1`)).status, 200, 'racks stay open');
  const login = await fetch(`${url}/api/coach/login`, { method: 'POST', body: JSON.stringify({ pin: '4321' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${url}/api/coach/athletes`, { headers: { cookie } })).status, 200);
  locked.close();
});

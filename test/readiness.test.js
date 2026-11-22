import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { today, shiftDay } from '../src/store.js';
import { flagPractice, adjustmentFor, adjustPct, parseTestValue, validTest, strengthSpeed, fmtTest } from '../src/readiness.js';

// ---------- pure math ----------
test('practice flags compare each kid with the team that day; a coach flag wins', () => {
  const rows = [10, 11, 12, 13, 14, 15, 16, 17, 25, 5].map((load, i) => ({ athlete_id: i + 1, load, collisions: i === 3 ? 20 : 6 }));
  rows[5].manual = 1; rows[5].flag = 'low';
  const f = flagPractice(rows);
  assert.equal(f[8].flag, 'high');          // 25 vs middle 13.5
  assert.equal(f[9].flag, 'low');           // 5 vs 13.5
  assert.equal(f[3].flag, 'high');          // 20 collisions vs middle 6
  assert.match(f[3].why, /20 collisions/);
  assert.equal(f[5].flag, 'low');           // coach said so
  assert.equal(f[5].why, 'set by coach');
  assert.equal(f[0].flag, 'normal');
  assert.equal(flagPractice([{ athlete_id: 1 }])[0].flag, '', 'no numbers, no flag');
});

test('linemen are compared with linemen, not receivers', () => {
  const rows = [
    ...[14, 15, 13, 16, 24].map((c, i) => ({ athlete_id: i + 1, group: 'line', load: 350, collisions: c })),
    ...[3, 4, 5, 4].map((c, i) => ({ athlete_id: i + 10, group: 'skill', load: 420, collisions: c })),
  ];
  const f = flagPractice(rows);
  assert.deepEqual(f.filter((r) => r.flag === 'high').map((r) => r.athlete_id), [5], 'only the lineman way above other linemen');
  assert.match(f[4].why, /OL\/DL middle 15/);
});

test('the next lift within 3 days moves; older practices and normal days do not', () => {
  const p = [{ day: '2026-11-17', flag: 'high' }, { day: '2026-11-19', flag: 'low' }];
  assert.equal(adjustmentFor(p, '2026-11-20', {}).pts, 5, 'most recent practice wins');
  assert.equal(adjustmentFor(p, '2026-11-18', {}).pts, -10);
  assert.equal(adjustmentFor(p, '2026-11-24', {}), null, 'more than 3 days later');
  assert.equal(adjustmentFor(p, '2026-11-19', {}).flag, 'high', 'same-day practice does not count');
  assert.equal(adjustmentFor(p, '2026-11-20', { load_adjust: 'off' }), null);
  assert.equal(adjustmentFor(p, '2026-11-18', { load_high_pts: '-15' }).pts, -15);
  assert.equal(adjustPct(0.75, { pts: -10 }), 0.65);
  assert.equal(adjustPct(0.92, { pts: 5 }), 0.95, 'never above 95%');
  assert.equal(adjustPct(0.35, { pts: -10 }), 0.3, 'never below 30%');
  assert.equal(adjustPct(null, { pts: -10 }), null, 'kid-picks sets never change');
});

test('test values: feet-inches, m/s, and typos refused', () => {
  assert.equal(parseTestValue('broad', `8'4"`), 100);
  assert.equal(parseTestValue('broad', '8-4'), 100);
  assert.equal(parseTestValue('broad', '100'), 100);
  assert.equal(parseTestValue('top_speed', '9.2 m/s'), 20.6);
  assert.equal(parseTestValue('dash40', '4.71'), 4.71);
  assert.equal(validTest('dash40', 47.1), false);
  assert.equal(validTest('dash40', 4.71), true);
  assert.equal(fmtTest('broad', 100), `8'4"`);
  const s = strengthSpeed([{ speed: 20, strength: 30 }, { speed: 16, strength: 40 }, { speed: 21, strength: 20 }, { speed: 15, strength: 10 }]);
  assert.deepEqual(s.points.map((p) => p.box), ['both', 'needs_speed', 'needs_bar', 'needs_both']);
});

// ---------- through the API ----------
let app, base;
const dir = mkdtempSync(join(tmpdir(), 'bobcat-ready-'));
async function call(path, body, method) {
  const res = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
before(async () => {
  app = createApp({ dataDir: dir, log: () => {} });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  // Made-up kids only: this repo is public.
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
  const csv = 'First,Last,Grad,Position,Bodyweight,Rack,Squat,Bench,Clean\n' +
    names.map((n, i) => `Test,${n},2027,${i < 3 ? 'OL' : 'WR'},${i < 3 ? 260 : 175},1,${400 - i * 20},${260 - i * 10},${240 - i * 10}`).join('\n');
  await call('/api/coach/import', { csv });
});
after(() => app.close());

const day = today();
const practice = shiftDay(day, -1);

test('practice CSV from the pods lowers a heavy kid\'s % today and shows why', async () => {
  await call('/api/coach/workout', { day, items: [{ lift: 'squat', scheme: '3x5@75' }, { lift: 'bench', scheme: '3x5' }] });
  const csv = `Player Name,Date,Total Player Load,Collisions,Max Velocity (m/s)\n` +
    `Test Alpha,${practice},620,30,7.9\nTest Bravo,${practice},400,8,8.1\nTest Charlie,${practice},380,7,8.0\n` +
    `T. Delta,${practice},410,6,9.4\nEcho Test-Nobody,${practice},400,6,9\nTest Foxtrot,${practice},150,2,9.6\nTeam Average,${practice},400,7,8.5\n`;
  const dry = (await call('/api/coach/practice/import', { csv, dry_run: true })).data;
  assert.equal(dry.matched, 5);
  assert.deepEqual(dry.unmatched, ['Echo Test-Nobody'], 'team rows are skipped, strangers are named');
  assert.deepEqual(dry.days, [practice]);
  assert.equal(dry.preview.find((p) => p.name === 'Test Alpha').top_speed_mph, 17.7, 'm/s turned into mph');

  const real = (await call('/api/coach/practice/import', { csv })).data;
  assert.equal(real.matched, 5);
  const pd = (await call(`/api/coach/practice?day=${practice}`)).data;
  assert.equal(pd.rows.find((r) => r.last_name === 'Alpha').flag, 'high');
  assert.equal(pd.rows.find((r) => r.last_name === 'Foxtrot').flag, 'low');
  assert.equal(pd.rows.find((r) => r.last_name === 'Bravo').flag, 'normal');

  const crew = (await call('/api/rack/1')).data.crew;
  const alpha = crew.find((c) => c.display === 'T. Alpha');
  assert.equal(alpha.adjust.label, 'LIGHTER TODAY');
  assert.equal(alpha.first_pct, 0.65);
  assert.equal(alpha.first_weight, 260); // 400 x .65
  const fox = crew.find((c) => c.display === 'T. Foxtrot');
  assert.equal(fox.first_pct, 0.8);      // 300 x .80
  assert.equal(fox.first_weight, 240);
  assert.equal(crew.find((c) => c.display === 'T. Bravo').adjust, null);

  // the rack's session screen agrees
  const s = (await call('/api/sessions', { athlete_id: alpha.id, rack_id: 1, item_id: (await call('/api/rack/1')).data.items[0].id })).data;
  assert.equal(s.plan[0].weight, 260);
  assert.equal(s.plan[0].base_pct, 0.75);
  assert.equal(s.adjust.flag, 'high');
});

test('coach overrides a flag, can put it back on auto, and can turn the whole thing off', async () => {
  const alpha = (await call('/api/rack/1')).data.crew.find((c) => c.display === 'T. Alpha');
  await call('/api/coach/practice/flag', { athlete_id: alpha.id, day: practice, flag: 'normal' });
  assert.equal((await call('/api/rack/1')).data.crew.find((c) => c.id === alpha.id).adjust, null);
  // a re-import does not undo the coach
  await call('/api/coach/practice/import', { csv: `Player,Player Load\nTest Alpha,620\nTest Bravo,400\nTest Charlie,380`, day: practice });
  assert.equal((await call(`/api/coach/practice?day=${practice}`)).data.rows.find((r) => r.last_name === 'Alpha').flag, 'normal');
  await call('/api/coach/practice/flag', { athlete_id: alpha.id, day: practice, flag: 'auto' });
  assert.equal((await call('/api/rack/1')).data.crew.find((c) => c.id === alpha.id).first_weight, 260);
  await call('/api/coach/settings', { load_adjust: 'off' });
  assert.equal((await call('/api/rack/1')).data.crew.find((c) => c.id === alpha.id).first_weight, 300);
  await call('/api/coach/settings', { load_adjust: 'on' });
});

test('GPS top speeds land on the speed board; typed and pasted tests too', async () => {
  let board = (await call('/api/board/speed')).data;
  const top = board.boards.find((b) => b.key === 'top_speed');
  assert.equal(top.leaders[0].athlete.display, 'T. Foxtrot');
  assert.equal(top.leaders[0].value, 21.5);
  assert.equal(board.week.length, 5);

  const kids = (await call('/api/coach/tests')).data;
  const id = (n) => kids.find((k) => k.last_name === n).id;
  const typed = (await call('/api/coach/tests', { entries: [{ athlete_id: id('Delta'), test: 'dash40', value: '4.62' }, { athlete_id: id('Alpha'), test: 'dash40', value: '46.2' }, { athlete_id: id('Alpha'), test: 'broad', value: `8'4"` }] })).data;
  assert.equal(typed.saved, 2);
  assert.equal(typed.bad.length, 1, 'a 46-second 40 is a typo');
  const pasted = (await call('/api/coach/tests/import', { csv: 'Name\t40 yd\tVert\tPro Agility\nTest Bravo\t4.95\t28.5\t4.40\nTest Delta\t4.80\t\t\nNobody Here\t5.0\t\t' })).data;
  assert.equal(pasted.saved, 4);
  assert.deepEqual(pasted.unmatched, ['Nobody Here']);
  board = (await call('/api/board/speed')).data;
  const forty = board.boards.find((b) => b.key === 'dash40');
  assert.equal(forty.leaders[0].athlete.display, 'T. Delta');
  assert.equal(forty.leaders[0].value, 4.62, 'best time kept, not latest');
  assert.equal(board.boards.find((b) => b.key === 'broad').leaders[0].value, 100);
});

test('strength vs speed splits line and skill at their own middles', async () => {
  const g = (await call('/api/coach/strength-speed')).data;
  const line = g.find((x) => x.group === 'line'), skill = g.find((x) => x.group === 'skill');
  assert.equal(line.points.length, 3);
  assert.equal(skill.points.length, 2);
  for (const x of [...line.points, ...skill.points]) assert.ok(['both', 'needs_speed', 'needs_bar', 'needs_both'].includes(x.box));
  assert.equal(line.points.find((p) => p.athlete.display === 'T. Alpha').box, 'needs_speed');
});

// Made-up kids and three weeks of lifting so every screen has something on it.
// Used by `npm run seed` and by the browser demo. No Node imports.
import { today } from './store.js';
import { tx } from './tx.js';

export function seedDemo(store) {
  return tx(store.db, () => {
    // Repeatable "random" numbers so the demo looks the same every time.
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const round5 = (x) => Math.round(x / 5) * 5;

    const FIRST = ['Mason', 'Isaiah', 'Tyler', 'Caleb', 'Ryan', 'Andre', 'Luke', 'Dylan', 'Nate', 'Eli', 'Jalen', 'Cody', 'Trey', 'Owen', 'Drew', 'Marcus', 'Seth', 'Gavin', 'Colton', 'Jace', 'Brady', 'Logan', 'Devin', 'Malik', 'Wyatt', 'Carter', 'Zane', 'Hunter', 'Kobe', 'Reid'];
    const LAST = ['Vance', 'Osei', 'Mercer', 'Whitt', 'Banks', 'Romero', 'Tate', 'Holt', 'Kline', 'Pruitt', 'Delgado', 'Farrow', 'Hayes', 'Brooks', 'Crane', 'Dunn', 'Ellis', 'Foster', 'Grady', 'Hale', 'Ivey', 'Jessup', 'Keller', 'Lowe', 'Marsh', 'Nash', 'Ortiz', 'Pace', 'Quinn', 'Reyes', 'Shaw', 'Tull', 'Upton', 'Voss', 'Wade', 'Yates', 'Ames', 'Boone', 'Cobb', 'Dean'];
    const POS = [['OL', 14, 265, 1.25], ['DL', 10, 245, 1.25], ['LB', 8, 205, 1.3], ['RB', 6, 185, 1.4], ['WR', 9, 165, 1.3], ['DB', 9, 165, 1.35], ['QB', 4, 180, 1.2], ['TE', 5, 215, 1.3], ['K', 2, 165, 1.1], ['ATH', 3, 175, 1.3]];

    const now = new Date();
    const seniorsGrad = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
    const used = new Set();
    const kids = [];
    let rackTurn = 0; // every 7th kid gets a rack: 5 per rack, like one lifting group on the two pilot racks
    for (const [pos, count, bw, strength] of POS) {
      for (let i = 0; i < count; i++) {
        let first; let last;
        do { first = pick(FIRST); last = pick(LAST); } while (used.has(first + last));
        used.add(first + last);
        const grad = seniorsGrad + Math.floor(rnd() * 4);
        const age = seniorsGrad + 3 - grad; // 0 = freshman
        const body = Math.round(bw * (0.85 + rnd() * 0.3) + age * 6);
        const k = strength * (0.8 + rnd() * 0.35) * (0.85 + age * 0.07);
        const a = store.saveAthlete({ first_name: first, last_name: last, grad_year: grad, position: pos, bodyweight_lb: body, default_rack: kids.length % 7 === 0 ? (rackTurn++ % 2) + 1 : null });
        kids.push({ a, squat: round5(body * k * 1.2), bench: round5(body * k * 0.8), clean: round5(body * k * 0.72) });
      }
    }

    // Two max days: one five weeks ago (season start) and one last week.
    const dayStr = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return today(d); };
    const testDay1 = dayStr(-35);
    const testDay2 = dayStr(-7);
    store.saveSettings({ season_start: testDay1 });
    for (const kid of kids) {
      const entries1 = ['squat', 'bench', 'clean'].map((lift) => ({ athlete_id: kid.a.id, lift, weight: round5(kid[lift] * (0.9 + rnd() * 0.06)) }));
      store.addMaxes(entries1, testDay1);
      store.addMaxes(['squat', 'bench', 'clean'].map((lift) => ({ athlete_id: kid.a.id, lift, weight: kid[lift] })), testDay2);
    }

    // Workouts: Mon squat day, Wed bench day, Fri clean day, for the last 3 weeks plus today.
    const plans = {
      squat: [{ lift: 'squat', scheme: '5x3@75', on_board: 1 }, { lift: 'bench', scheme: '4x5@70' }, { lift: 'clean', scheme: '5x2@65' }],
      bench: [{ lift: 'bench', scheme: '3@70, 3@80, 3+@85', on_board: 1 }, { lift: 'squat', scheme: '3x5@65' }],
      clean: [{ lift: 'clean', scheme: '6x2@70', on_board: 1 }, { lift: 'squat', scheme: '3x3@80' }],
    };
    const cycle = ['squat', 'bench', 'clean'];
    const days = [];
    for (let off = -20; off < 0; off += 2) days.push(dayStr(off));
    days.forEach((d, i) => store.saveWorkout(d, plans[cycle[i % 3]]));
    store.saveWorkout(today(), plans.squat);

    // Past lifting so "Beat Your Last" has something to beat. Today stays empty for the live demo.
    for (const [i, d] of days.entries()) {
      for (const kid of kids) {
        if (rnd() < 0.2) continue; // missed a day
        for (const item of store.workout(d).filter((w) => w.seq < 999)) {
          const s = store.startSession({ athlete_id: kid.a.id, rack_id: kid.a.default_rack, item_id: item.id }, { view: false });
          const plan = store.plan(kid.a.id, item);
          for (const set of plan) {
            const reps = set.amrap ? set.reps + Math.floor(rnd() * 4) : set.reps - (rnd() < 0.07 ? 1 : 0);
            store.logSet(s.id, { weight: set.weight || 95, reps: Math.max(1, reps) }, { view: false });
          }
          store.endSession(s.id);
        }
      }
    }
    // Yesterday's practice off the GPS pods, so a few kids lift lighter (or heavier) today.
    const yesterday = dayStr(-1);
    const isLine = (p) => ['OL', 'DL'].includes(p);
    store.savePracticeDay(yesterday, kids.map((kid, i) => {
      const pos = kid.a.position;
      const heavy = i % 11 === 3, light = i % 13 === 5;
      return {
        athlete_id: kid.a.id,
        load: Math.round((isLine(pos) ? 360 : 420) * (0.85 + rnd() * 0.3) * (heavy ? 1.55 : light ? 0.45 : 1)),
        collisions: Math.round((isLine(pos) ? 14 : ['LB', 'RB', 'TE'].includes(pos) ? 10 : 4) * (0.7 + rnd() * 0.6)),
        top_speed_mph: Math.round((isLine(pos) ? 15.2 : ['WR', 'DB', 'RB'].includes(pos) ? 19 : 17.2) * (0.92 + rnd() * 0.14) * 10) / 10,
      };
    }), 'demo');

    // Test day results (made up): 40, pro agility, vertical, broad.
    const tests = [];
    for (const kid of kids) {
      if (rnd() < 0.25) continue;
      const fast = isLine(kid.a.position) ? 0 : ['WR', 'DB', 'RB'].includes(kid.a.position) ? 1 : 0.5;
      tests.push({ athlete_id: kid.a.id, test: 'dash40', value: Math.round((5.55 - fast * 0.75 + rnd() * 0.35) * 100) / 100 });
      tests.push({ athlete_id: kid.a.id, test: 'shuttle', value: Math.round((4.95 - fast * 0.5 + rnd() * 0.3) * 100) / 100 });
      tests.push({ athlete_id: kid.a.id, test: 'vertical', value: Math.round((22 + fast * 8 + rnd() * 6) * 2) / 2 });
      tests.push({ athlete_id: kid.a.id, test: 'broad', value: Math.round(88 + fast * 18 + rnd() * 12) });
    }
    store.addTests(tests, testDay2, 'demo');
    return { athletes: kids.length, days: days.length, testDay1, testDay2 };
  });
}

// Fills a database with made-up kids and a few weeks of lifting so every screen has something on it.
//   npm run seed            (writes data/bobcat.db; refuses if it already has athletes)
//   npm run seed -- --force (wipes and re-seeds; never run this on the real school database)
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { Store } from '../src/store.js';
import { seedDemo } from '../src/demo-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || join(root, 'data');
const file = join(dataDir, 'bobcat.db');
const force = process.argv.includes('--force');

if (existsSync(file) && force) for (const ext of ['', '-wal', '-shm']) rmSync(file + ext, { force: true });
const db = openDb(file);
const store = new Store(db);
if (store.athletes().length && !force) {
  console.log('This database already has athletes. Use --force to wipe it (careful).');
  process.exit(1);
}

const r = seedDemo(store);
console.log(`Seeded ${r.athletes} athletes, ${r.days} past workouts, and today's squat day.`);
console.log(`Max days: ${r.testDay1} and ${r.testDay2}. Open /coach, /tv, /rack/1.`);

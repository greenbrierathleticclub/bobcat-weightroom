// Nightly copy of the database to a USB stick (or any folder).
// Uses SQLite's VACUUM INTO, which makes a clean copy even while the app is running.
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class Backups {
  constructor(db, { dir, keep = 30, log = console.log } = {}) {
    this.db = db;
    this.dir = dir;
    this.keep = keep;
    this.log = log;
    this.last = null; // { ok, file, at, error }
  }

  run(reason = 'manual') {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = join(this.dir, `bobcat-${stamp}.db`);
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      this.prune();
      this.last = { ok: true, file, at: new Date().toISOString(), reason };
      this.log(`[backup] ${reason}: wrote ${file}`);
    } catch (err) {
      this.last = { ok: false, error: err.message, at: new Date().toISOString(), reason };
      this.log(`[backup] ${reason} FAILED: ${err.message}`);
    }
    return this.last;
  }

  status() {
    return { dir: this.dir, last: this.last, files: this.list() };
  }

  list() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => /^bobcat-.*\.db$/.test(f))
      .map((f) => ({ file: f, size: statSync(join(this.dir, f)).size }))
      .sort((a, b) => (a.file < b.file ? 1 : -1));
  }

  prune() {
    for (const old of this.list().slice(this.keep)) unlinkSync(join(this.dir, old.file));
  }

  // Checks every few minutes; runs once a day after the set hour.
  schedule(getHour) {
    let lastDay = null;
    const tick = () => {
      const now = new Date();
      const day = now.toDateString();
      if (now.getHours() >= Number(getHour() ?? 22) && lastDay !== day) {
        lastDay = day;
        this.run('nightly');
      }
    };
    return setInterval(tick, 5 * 60 * 1000);
  }
}

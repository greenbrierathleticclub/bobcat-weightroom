// Bobcat Weight Room server. Plain Node, no frameworks, no internet needed.
//   node src/server.js          then open http://<this computer>:8080
// Env: PORT (8080), DATA_DIR (./data), BACKUP_DIR (DATA_DIR/backups), COACH_PIN (blank = no lock)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { join, dirname, extname, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { openDb } from './db.js';
import { Store, today, httpError } from './store.js';
import { importRoster, exportRosterCsv } from './csv.js';
import { Backups } from './backup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');

export function createApp({ dataDir = join(root, 'data'), backupDir, coachPin = '', dbFile, log = console.log } = {}) {
  mkdirSync(join(dataDir, 'photos'), { recursive: true });
  const db = openDb(dbFile || join(dataDir, 'bobcat.db'));
  const clients = new Set();
  let pending = null;
  // Tell every screen something changed (batched so a burst of writes sends one ping).
  const onChange = (what) => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      for (const res of clients) res.write(`event: change\ndata: ${JSON.stringify({ what, at: Date.now() })}\n\n`);
    }, 150);
  };
  const store = new Store(db, { onChange });
  const backups = new Backups(db, { dir: backupDir || join(dataDir, 'backups'), log });

  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

  function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(data);
  }
  function serveFile(res, file) {
    if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  }
  async function body(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 15 * 1024 * 1024) throw httpError(413, 'Too big');
      chunks.push(c);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw httpError(400, 'Bad JSON'); }
  }
  function cookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  const isCoach = (req) => !coachPin || cookies(req).coach_pin === coachPin;

  // [method, pattern, handler, coachOnly]
  const routes = [
    ['GET', '/api/rack/:id', (p, q) => store.rackState(Number(p.id), q.get('day') || today())],
    ['GET', '/api/athletes', () => store.athletes().map((a) => ({ id: a.id, display: a.display, full: a.full, initials: a.initials, position: a.position, cls: a.cls, photo_url: a.photo_url, last_name: a.last_name, first_name: a.first_name }))],
    ['GET', '/api/athletes/:id/card', (p, q) => store.athleteCard(Number(p.id), Number(q.get('item')) || null)],
    ['POST', '/api/sessions', (p, q, b) => store.startSession(b)],
    ['GET', '/api/sessions/:id', (p) => store.sessionView(Number(p.id))],
    ['POST', '/api/sessions/:id/sets', (p, q, b) => store.logSet(Number(p.id), b)],
    ['POST', '/api/sessions/:id/undo', (p) => store.undoLastSet(Number(p.id))],
    ['POST', '/api/sessions/:id/end', (p) => store.endSession(Number(p.id))],
    ['GET', '/api/board/today', (p, q) => store.todayBoard(q.get('day') || today())],
    ['GET', '/api/board/season', () => store.seasonBoard()],
    ['GET', '/api/settings', () => store.settings()],

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
    ['POST', '/api/coach/settings', (p, q, b) => store.saveSettings(b), true],
    ['GET', '/api/coach/backups', () => ({ dir: backups.dir, last: backups.last, files: backups.list() }), true],
    ['POST', '/api/coach/backups', () => backups.run('manual'), true],
    ['GET', '/api/coach/backups/:file', (p) => ({ __file: join(backups.dir, basename(p.file)) }), true],
  ].map(([method, path, fn, coach]) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    return { method, re, keys, fn, coach };
  });

  function savePhoto(id, b) {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(b.data_url || '');
    if (!m) throw httpError(400, 'Send a JPEG, PNG or WebP');
    const file = `${id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    writeFileSync(join(dataDir, 'photos', file), Buffer.from(m[2], 'base64'));
    store.setPhoto(id, file);
    return { photo_url: `/photos/${file}` };
  }

  const PAGES = { '/': 'index.html', '/tv': 'tv.html', '/coach': 'coach.html' };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    try {
      if (path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('retry: 3000\n\n');
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (path === '/api/coach/login' && req.method === 'POST') {
        const b = await body(req);
        if (coachPin && String(b.pin) !== coachPin) return send(res, 401, { error: 'Wrong PIN' });
        return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': `coach_pin=${encodeURIComponent(coachPin)}; Path=/; Max-Age=31536000; SameSite=Lax` });
      }
      if (path.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(path);
          if (!m) continue;
          if (r.coach && !isCoach(req)) return send(res, 401, { error: 'Coach PIN needed' });
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          const b = req.method === 'POST' || req.method === 'PUT' ? await body(req) : {};
          const out = await r.fn(params, url.searchParams, b);
          if (out && out.__raw != null) return send(res, 200, out.__raw, out.type, { 'Content-Disposition': `attachment; filename="${out.file}"` });
          if (out && out.__file) {
            res.setHeader('Content-Disposition', `attachment; filename="${basename(out.__file)}"`);
            return serveFile(res, out.__file);
          }
          return send(res, 200, out ?? { ok: true });
        }
        return send(res, 404, { error: 'No such API' });
      }
      if (/^\/rack\/\d+\/?$/.test(path)) return serveFile(res, join(PUBLIC, 'rack.html'));
      if (PAGES[path]) return serveFile(res, join(PUBLIC, PAGES[path]));
      if (path.startsWith('/photos/')) return serveFile(res, join(dataDir, 'photos', basename(path)));
      const file = normalize(join(PUBLIC, path));
      if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Nope' });
      return serveFile(res, file);
    } catch (err) {
      if (!err.status) log(err);
      return send(res, err.status || 500, { error: err.message || 'Server error' });
    }
  }

  const server = createServer(handle);
  return { server, store, backups, db, close: () => { for (const c of clients) c.end(); server.close(); db.close(); } };
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

// Run directly: start the server and the nightly backup.
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT) || 8080;
  const app = createApp({ dataDir: process.env.DATA_DIR, backupDir: process.env.BACKUP_DIR, coachPin: process.env.COACH_PIN || '' });
  app.backups.schedule(() => app.store.settings().backup_hour);
  app.server.listen(port, '0.0.0.0', () => {
    const ips = lanAddresses();
    console.log(`\n  Bobcat Weight Room is running.\n`);
    for (const ip of ips.length ? ips : ['localhost']) {
      console.log(`  Coach page:  http://${ip}:${port}/coach`);
      console.log(`  TV:          http://${ip}:${port}/tv`);
      console.log(`  Rack 1:      http://${ip}:${port}/rack/1\n`);
    }
  });
}

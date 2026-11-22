// The whole "server" for the demo, running inside the viewer's browser tab.
// Same store, same routes, same rules as the real box. Only the disk is fake.
import { BrowserDb } from './sqlite-adapter.js';
import { Store } from './store.js';
import { setupDb } from './setup.js';
import { buildRoutes, matchRoute } from './routes.js';
import { seedDemo } from './demo-data.js';
import SCHEMA from './schema.js';

let db; let routes; let store;
const listeners = new Set();
let pending = new Set();
let timer = null;

function onChange(what) {
  pending.add(what);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const batch = [...pending];
    pending = new Set();
    for (const what of batch) for (const fn of listeners) { try { fn({ what, at: Date.now() }); } catch { listeners.delete(fn); } }
  }, 60);
}

export async function startEngine() {
  const SQL = await window.initSqlJs();
  if (db) db.close();
  db = new BrowserDb(SQL);
  db.exec('PRAGMA foreign_keys = ON;');
  setupDb(db, SCHEMA);
  store = new Store(db, { onChange: () => {} });
  const seeded = seedDemo(store);
  store.onChange = onChange;
  const backups = {
    status: () => ({ dir: 'USB stick BOBCATBAK (on the real box)', last: null, files: [] }),
    run: () => ({ ok: true, file: 'demo-only: backups go to the USB stick on the real box' }),
  };
  const savePhoto = (id, b) => {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.data_url || '')) { const e = new Error('Send a JPEG, PNG or WebP'); e.status = 400; throw e; }
    store.setPhoto(id, b.data_url);
    return { photo_url: b.data_url };
  };
  const backupFile = () => { const e = new Error('Backups live on the USB stick on the real box'); e.status = 404; throw e; };
  routes = buildRoutes({ store, backups, savePhoto, backupFile });
  return seeded;
}

// Called by the screens (through demo-shim.js) in place of a real fetch.
export function handle(method, path, body) {
  const url = new URL(path, 'http://demo');
  if (url.pathname === '/api/coach/login') return { status: 200, data: { ok: true } };
  const hit = matchRoute(routes, method, url.pathname);
  if (!hit) return { status: 404, data: { error: 'No such API' } };
  try {
    const out = hit.route.fn(hit.params, url.searchParams, body || {});
    if (out && out.__raw != null) return { status: 200, raw: out.__raw, type: out.type };
    return { status: 200, data: out ?? { ok: true } };
  } catch (err) {
    if (!err.status) console.error(err);
    return { status: err.status || 500, data: { error: err.message || 'Something broke' } };
  }
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

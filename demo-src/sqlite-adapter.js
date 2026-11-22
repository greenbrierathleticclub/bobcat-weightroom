// Makes sql.js (SQLite compiled to JavaScript) look like Node's built-in node:sqlite,
// so store.js runs unchanged in the browser demo.

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

function params(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const out = {};
    for (const [k, v] of Object.entries(args[0])) out[/^[$:@]/.test(k) ? k : `$${k}`] = clean(v);
    return out;
  }
  return args.map(clean);
}

export class BrowserDb {
  constructor(SQL) {
    this.raw = new SQL.Database();
    this.cache = new Map();
    this.isTransaction = false;
  }

  exec(sql) {
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    this.raw.exec(sql);
    if (word === 'BEGIN') this.isTransaction = true;
    if (word === 'COMMIT' || word === 'ROLLBACK' || word === 'END') this.isTransaction = false;
  }

  prepare(sql) {
    let stmt = this.cache.get(sql);
    if (!stmt) { stmt = this.raw.prepare(sql); this.cache.set(sql, stmt); }
    const raw = this.raw;
    return {
      get: (...a) => {
        try {
          stmt.bind(params(a));
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally { stmt.reset(); }
      },
      all: (...a) => {
        const rows = [];
        try {
          stmt.bind(params(a));
          while (stmt.step()) rows.push(stmt.getAsObject());
        } finally { stmt.reset(); }
        return rows;
      },
      run: (...a) => {
        try {
          stmt.bind(params(a));
          stmt.step();
        } finally { stmt.reset(); }
        const changes = raw.getRowsModified();
        const lastInsertRowid = raw.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
        return { changes, lastInsertRowid };
      },
    };
  }

  close() {
    for (const s of this.cache.values()) s.free();
    this.raw.close();
  }
}

// Wrap several writes in one transaction. No Node imports, so it also runs in the browser demo.
export function tx(db, fn) {
  if (db.isTransaction) return fn(); // already inside one: just join it
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Creates tables and starting rows. No Node imports, so the browser demo uses it too.
export const DEFAULT_LIFTS = [
  { key: 'squat', name: 'Back squat', short: 'Squat', in_total: 1, has_max: 1 },
  { key: 'bench', name: 'Bench press', short: 'Bench', in_total: 1, has_max: 1 },
  { key: 'clean', name: 'Power clean', short: 'Clean', in_total: 1, has_max: 1 },
];

export const DEFAULT_SETTINGS = {
  school: 'GREENBRIER BOBCATS',
  round_to: '5',
  rack_count: '2',
  tv_rotate_seconds: '20',
  rack_idle_seconds: '90',     // back to the idle screen after this long untouched
  rack_sleep_seconds: '300',   // go dark after this long on the idle screen
  season_start: '',            // YYYY-MM-DD; Most Improved compares to the first max on or after this
  backup_hour: '22',           // nightly backup, 24h clock
};

export function setupDb(db, schemaSql) {
  db.exec(schemaSql);

  const addLift = db.prepare('INSERT OR IGNORE INTO lifts (key, name, short, in_total, has_max) VALUES ($key, $name, $short, $in_total, $has_max)');
  for (const l of DEFAULT_LIFTS) addLift.run({ $key: l.key, $name: l.name, $short: l.short, $in_total: l.in_total, $has_max: l.has_max });

  const addSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) addSetting.run(k, v);

  const rackCount = Number(db.prepare("SELECT value FROM settings WHERE key = 'rack_count'").get().value) || 2;
  const haveRacks = db.prepare('SELECT COUNT(*) AS n FROM racks').get().n;
  const addRack = db.prepare('INSERT INTO racks (id, name) VALUES (?, ?)');
  for (let i = haveRacks + 1; i <= rackCount; i++) addRack.run(i, `Rack ${i}`);

  return db;
}

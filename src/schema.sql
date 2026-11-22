-- Bobcat Weight Room schema. One SQLite file, no server.
-- Shaped so a camera can later fill reps.velocity_* without changing anything else.

CREATE TABLE IF NOT EXISTS athletes (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  grad_year     INTEGER,
  sport         TEXT NOT NULL DEFAULT 'football',
  position      TEXT,                       -- e.g. OL, DL, WR
  group_tag     TEXT,                       -- 'line' (OL/DL) or 'skill', drives the Strongest split
  bodyweight_lb REAL,
  photo_path    TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lifts (
  id        INTEGER PRIMARY KEY,
  key       TEXT UNIQUE NOT NULL,           -- squat, bench, clean
  name      TEXT NOT NULL,
  in_total  INTEGER NOT NULL DEFAULT 1       -- counts toward season totals
);

-- Max history. The current max is the latest approved row.
CREATE TABLE IF NOT EXISTS maxes (
  id          INTEGER PRIMARY KEY,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id),
  lift_id     INTEGER NOT NULL REFERENCES lifts(id),
  weight_lb   REAL NOT NULL,
  source      TEXT NOT NULL,                -- 'tested', 'import', 'pr_suggested'
  status      TEXT NOT NULL DEFAULT 'approved', -- 'approved' | 'pending' | 'rejected'
  set_id      INTEGER REFERENCES sets(id),  -- the set that triggered a suggested max
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- The day's workout the coach loads once.
CREATE TABLE IF NOT EXISTS workouts (
  id         INTEGER PRIMARY KEY,
  day        TEXT NOT NULL,                 -- YYYY-MM-DD
  lift_id    INTEGER NOT NULL REFERENCES lifts(id),
  title      TEXT,
  round_to   REAL NOT NULL DEFAULT 5
);
CREATE TABLE IF NOT EXISTS workout_sets (
  id          INTEGER PRIMARY KEY,
  workout_id  INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  pct         REAL NOT NULL,                -- 0.75 = 75% of max
  reps        INTEGER NOT NULL,
  amrap       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS racks (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL                       -- 'Rack 1'
);

-- A session = one athlete on one rack for one workout.
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id),
  rack_id     INTEGER REFERENCES racks(id),
  workout_id  INTEGER REFERENCES workouts(id),
  lift_id     INTEGER NOT NULL REFERENCES lifts(id),
  day         TEXT NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS sets (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES sessions(id),
  seq         INTEGER NOT NULL,
  weight_lb   REAL NOT NULL,
  reps        INTEGER NOT NULL,
  e1rm_lb     REAL NOT NULL,                -- estimated max from this set
  is_pr       INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'typed', -- 'typed' now, 'camera' later
  voided      INTEGER NOT NULL DEFAULT 0,   -- coach can kill bad entries
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Per-rep detail. Empty in phase 1; the camera fills it later.
CREATE TABLE IF NOT EXISTS reps (
  id                 INTEGER PRIMARY KEY,
  set_id             INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  seq                INTEGER NOT NULL,
  mean_velocity_mps  REAL,
  peak_velocity_mps  REAL,
  rom_m              REAL,
  path_json          TEXT                   -- bar path points for replay
);

CREATE INDEX IF NOT EXISTS idx_sets_session ON sets(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_athlete_lift ON sessions(athlete_id, lift_id, day);
CREATE INDEX IF NOT EXISTS idx_maxes_athlete_lift ON maxes(athlete_id, lift_id, status);

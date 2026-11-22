-- Bobcat Weight Room schema. One SQLite file, no database server.
-- reps.* is empty in phase 1; a camera fills it later without changing anything else.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS racks (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lifts (
  id        INTEGER PRIMARY KEY,
  key       TEXT UNIQUE NOT NULL,          -- squat, bench, clean, rdl...
  name      TEXT NOT NULL,                 -- Back squat
  short     TEXT NOT NULL,                 -- Squat
  in_total  INTEGER NOT NULL DEFAULT 0,    -- counts toward season totals
  has_max   INTEGER NOT NULL DEFAULT 0     -- coach tracks a max for it
);

CREATE TABLE IF NOT EXISTS athletes (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  grad_year     INTEGER,
  sport         TEXT NOT NULL DEFAULT 'football',
  position      TEXT,                      -- OL, DL, WR...
  group_tag     TEXT,                      -- 'line' or 'skill'; blank = worked out from position
  bodyweight_lb REAL,
  default_rack  INTEGER REFERENCES racks(id),
  photo         TEXT,                      -- file name under data/photos
  active        INTEGER NOT NULL DEFAULT 1
);

-- Max history. Only the coach changes these (max day or roster import).
-- The current max is the newest row for that athlete and lift.
CREATE TABLE IF NOT EXISTS maxes (
  id          INTEGER PRIMARY KEY,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id),
  lift_id     INTEGER NOT NULL REFERENCES lifts(id),
  weight_lb   REAL NOT NULL,
  tested_on   TEXT NOT NULL,               -- YYYY-MM-DD
  source      TEXT NOT NULL DEFAULT 'tested', -- 'tested' | 'import'
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- The day's workout: an ordered list of lifts, each with a free-form scheme
-- the coach types ("5x3@75", "3@65, 3@75, 3+@85", "3x8", "1x5@225lb").
CREATE TABLE IF NOT EXISTS workout_items (
  id        INTEGER PRIMARY KEY,
  day       TEXT NOT NULL,                 -- YYYY-MM-DD
  seq       INTEGER NOT NULL,
  lift_id   INTEGER NOT NULL REFERENCES lifts(id),
  scheme    TEXT NOT NULL,
  on_board  INTEGER NOT NULL DEFAULT 0,    -- the Beat Your Last lift for the day
  note      TEXT
);

-- One athlete doing one workout item at one rack.
CREATE TABLE IF NOT EXISTS sessions (
  id               INTEGER PRIMARY KEY,
  athlete_id       INTEGER NOT NULL REFERENCES athletes(id),
  rack_id          INTEGER REFERENCES racks(id),
  workout_item_id  INTEGER REFERENCES workout_items(id),
  lift_id          INTEGER NOT NULL REFERENCES lifts(id),
  day              TEXT NOT NULL,
  started_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ended_at         TEXT
);

CREATE TABLE IF NOT EXISTS sets (
  id            INTEGER PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES sessions(id),
  seq           INTEGER NOT NULL,
  weight_lb     REAL NOT NULL,
  reps          INTEGER NOT NULL,
  e1rm_lb       REAL NOT NULL,             -- estimated max from this set
  is_pr         INTEGER NOT NULL DEFAULT 0,
  prev_best_lb  REAL,                      -- what the PR beat
  source        TEXT NOT NULL DEFAULT 'typed', -- 'typed' now, 'camera' later
  voided        INTEGER NOT NULL DEFAULT 0, -- coach can kill a bad entry
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Per-rep detail for the camera. Empty in phase 1.
CREATE TABLE IF NOT EXISTS reps (
  id                 INTEGER PRIMARY KEY,
  set_id             INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  seq                INTEGER NOT NULL,
  mean_velocity_mps  REAL,
  peak_velocity_mps  REAL,
  rom_m              REAL,
  path_json          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sets_session ON sets(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day);
CREATE INDEX IF NOT EXISTS idx_sessions_athlete_lift ON sessions(athlete_id, lift_id, day);
CREATE INDEX IF NOT EXISTS idx_maxes_athlete_lift ON maxes(athlete_id, lift_id, tested_on);
CREATE INDEX IF NOT EXISTS idx_items_day ON workout_items(day, seq);

-- Practice load from the GPS pods (or typed in). One row per kid per practice day.
-- flag: 'high' | 'normal' | 'low' | '' (no numbers). manual = 1 when the coach set the flag by hand.
CREATE TABLE IF NOT EXISTS practice_load (
  id            INTEGER PRIMARY KEY,
  athlete_id    INTEGER NOT NULL REFERENCES athletes(id),
  day           TEXT NOT NULL,             -- YYYY-MM-DD of the practice
  load          REAL,                      -- the pod's "player load" (any unit, compared within the team)
  collisions    INTEGER,
  top_speed_mph REAL,
  flag          TEXT NOT NULL DEFAULT '',
  why           TEXT NOT NULL DEFAULT '',
  manual        INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'import',
  UNIQUE (athlete_id, day)
);
CREATE INDEX IF NOT EXISTS practice_load_day ON practice_load (day);

-- Speed and jump tests: top speed (GPS), 40, 10 split, pro agility, vertical, broad.
CREATE TABLE IF NOT EXISTS tests (
  id         INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  test       TEXT NOT NULL,                -- key from src/readiness.js TESTS
  value      REAL NOT NULL,                -- mph, seconds or inches
  day        TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'coach' -- 'coach' | 'gps' | 'import'
);
CREATE INDEX IF NOT EXISTS tests_by_kid ON tests (athlete_id, test);

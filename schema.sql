CREATE TABLE IF NOT EXISTS profiles (
  child_id       TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  avatar_emoji   TEXT NOT NULL,
  password_hash  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  jobs        JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS list_progress (
  id                 TEXT PRIMARY KEY,
  child_id           TEXT NOT NULL REFERENCES profiles(child_id),
  list_id            TEXT NOT NULL REFERENCES job_lists(id),
  date               DATE NOT NULL,
  completed_job_ids  TEXT[] NOT NULL DEFAULT '{}',
  all_complete       BOOLEAN NOT NULL DEFAULT FALSE
);

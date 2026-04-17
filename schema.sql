-- PaceIQ Database Schema
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New query → Run

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_id       BIGINT      UNIQUE NOT NULL,
  name            TEXT,
  email           TEXT,
  image           TEXT,
  access_token    TEXT        NOT NULL,
  refresh_token   TEXT        NOT NULL,
  token_expiry    BIGINT      NOT NULL,  -- Unix timestamp (seconds)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Activities ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id             BIGINT      UNIQUE NOT NULL,
  name                  TEXT,
  distance              NUMERIC     NOT NULL,          -- metres
  moving_time           INT         NOT NULL,          -- seconds
  elapsed_time          INT         NOT NULL,          -- seconds
  start_date            TIMESTAMPTZ NOT NULL,
  average_speed         NUMERIC,                       -- m/s
  max_speed             NUMERIC,                       -- m/s
  average_heartrate     NUMERIC,                       -- nullable
  max_heartrate         NUMERIC,                       -- nullable
  total_elevation_gain  NUMERIC,                       -- metres
  average_cadence       NUMERIC,                       -- nullable, steps/min
  summary_polyline      TEXT,                          -- nullable, encoded route polyline
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Goals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  target_date  DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Races ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS races (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  distance_km  NUMERIC     NOT NULL,
  date         DATE        NOT NULL,
  target_time  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Goal Insights ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goal_insights (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight      TEXT        NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Training Plans ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_plans (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan         TEXT        NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS activities_user_id_idx    ON activities(user_id);
CREATE INDEX IF NOT EXISTS activities_start_date_idx  ON activities(start_date DESC);
CREATE INDEX IF NOT EXISTS training_plans_user_id_idx ON training_plans(user_id);
CREATE INDEX IF NOT EXISTS training_plans_generated_at_idx ON training_plans(generated_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- All DB access in this app goes through server-side API routes using the
-- service_role key, which bypasses RLS. These policies prevent any accidental
-- direct access via the anon key.

ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Block all anon access (service_role bypasses RLS automatically)
CREATE POLICY "No anon access to users"
  ON users FOR ALL TO anon USING (false);

CREATE POLICY "No anon access to activities"
  ON activities FOR ALL TO anon USING (false);

ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to training_plans"
  ON training_plans FOR ALL TO anon USING (false);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access to goals" ON goals FOR ALL TO anon USING (false);

ALTER TABLE races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access to races" ON races FOR ALL TO anon USING (false);

ALTER TABLE goal_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access to goal_insights" ON goal_insights FOR ALL TO anon USING (false);

-- Allow authenticated Supabase Auth users to read only their own rows
-- (future-proof if you add Supabase Auth later)
CREATE POLICY "Authenticated users see own user row"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Authenticated users see own activities"
  ON activities FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Garmin Dashboard — Database Schema (multi-user)
-- ─────────────────────────────────────────────────────────────────────────────

-- Users: credentials stored encrypted, Garmin creds write-only
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    is_admin         BOOLEAN DEFAULT FALSE,
    garmin_email_enc BYTEA,
    garmin_pass_enc  BYTEA,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Daily summary: steps, calories, stress, body battery, SpO2, hydration
CREATE TABLE IF NOT EXISTS daily_summary (
    user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    steps               INT,
    step_goal           INT,
    distance_meters     FLOAT,
    active_calories     INT,
    total_calories      INT,
    floors_ascended     INT,
    floors_descended    INT,
    active_time_seconds INT,
    sedentary_seconds   INT,
    stress_avg          INT,
    stress_rest         INT,
    body_battery_high   INT,
    body_battery_low    INT,
    spo2_avg            FLOAT,
    spo2_min            FLOAT,
    hydration_ml        INT,
    resting_hr          INT,
    min_hr_day          INT,
    max_hr_day          INT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, date)
);

-- Sleep: duration, stages, sleep score
CREATE TABLE IF NOT EXISTS sleep (
    user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date             DATE NOT NULL,
    start_time       TIMESTAMPTZ,
    end_time         TIMESTAMPTZ,
    duration_seconds INT,
    light_seconds    INT,
    deep_seconds     INT,
    rem_seconds      INT,
    awake_seconds    INT,
    sleep_score      INT,
    avg_spo2         FLOAT,
    avg_respiration  FLOAT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, date)
);

-- HRV
CREATE TABLE IF NOT EXISTS hrv (
    user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    hrv_weekly_avg      INT,
    hrv_last_night      INT,
    hrv_last_night_5min INT,
    hrv_status          VARCHAR(20),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, date)
);

-- Activities / workouts
CREATE TABLE IF NOT EXISTS activities (
    user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id         BIGINT NOT NULL,
    start_time          TIMESTAMPTZ,
    activity_type       VARCHAR(50),
    name                VARCHAR(200),
    duration_seconds    INT,
    distance_meters     FLOAT,
    avg_hr              INT,
    max_hr              INT,
    calories            INT,
    avg_pace_sec_per_km FLOAT,
    aerobic_te          FLOAT,
    anaerobic_te        FLOAT,
    start_lat           DOUBLE PRECISION,
    start_lng           DOUBLE PRECISION,
    end_lat             DOUBLE PRECISION,
    end_lng             DOUBLE PRECISION,
    elevation_gain_m    FLOAT,
    avg_speed_mps       FLOAT,
    avg_cadence         INTEGER,
    avg_power           INTEGER,
    polyline            JSONB,
    country             VARCHAR(10),
    weather_data        JSONB,
    country_crossings   JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_id)
);

-- Tours (named trip groups)
CREATE TABLE IF NOT EXISTS tours (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tour_activities (
    tour_id     INT REFERENCES tours(id) ON DELETE CASCADE,
    activity_id BIGINT,
    PRIMARY KEY (tour_id, activity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_user_start ON activities(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_daily_user_date       ON daily_summary(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sleep_user_date       ON sleep(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tours_user            ON tours(user_id);

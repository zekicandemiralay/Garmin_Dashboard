-- ─────────────────────────────────────────────────────────────────────────────
-- Garmin Dashboard — Database Schema
-- ─────────────────────────────────────────────────────────────────────────────

-- Daily summary: steps, calories, stress, body battery, SpO2, hydration
CREATE TABLE IF NOT EXISTS daily_summary (
    date                DATE PRIMARY KEY,
    steps               INT,
    step_goal           INT,
    distance_meters     FLOAT,
    active_calories     INT,
    total_calories      INT,
    floors_ascended     INT,
    floors_descended    INT,
    active_time_seconds INT,
    sedentary_seconds   INT,
    stress_avg          INT,         -- 0–100
    stress_rest         INT,
    body_battery_high   INT,         -- 0–100
    body_battery_low    INT,
    spo2_avg            FLOAT,       -- blood oxygen %
    spo2_min            FLOAT,
    hydration_ml        INT,
    resting_hr          INT,
    min_hr_day          INT,
    max_hr_day          INT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Sleep: duration, stages, sleep score
CREATE TABLE IF NOT EXISTS sleep (
    date                DATE PRIMARY KEY,  -- night of sleep (start date)
    start_time          TIMESTAMPTZ,
    end_time            TIMESTAMPTZ,
    duration_seconds    INT,
    light_seconds       INT,
    deep_seconds        INT,
    rem_seconds         INT,
    awake_seconds       INT,
    sleep_score         INT,               -- Garmin sleep score 0–100
    avg_spo2            FLOAT,
    avg_respiration     FLOAT,             -- breaths per minute
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- HRV (Heart Rate Variability) — key longevity & recovery metric
CREATE TABLE IF NOT EXISTS hrv (
    date                DATE PRIMARY KEY,
    hrv_weekly_avg      INT,
    hrv_last_night      INT,
    hrv_last_night_5min INT,               -- 5-min reading during deep sleep
    hrv_status          VARCHAR(20),       -- BALANCED / UNBALANCED / POOR
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Activities / workouts
CREATE TABLE IF NOT EXISTS activities (
    activity_id         BIGINT PRIMARY KEY,
    start_time          TIMESTAMPTZ,
    activity_type       VARCHAR(50),       -- RUNNING, WALKING, CYCLING etc.
    name                VARCHAR(200),
    duration_seconds    INT,
    distance_meters     FLOAT,
    avg_hr              INT,
    max_hr              INT,
    calories            INT,
    avg_pace_sec_per_km FLOAT,
    aerobic_te          FLOAT,             -- Training Effect (aerobic)
    anaerobic_te        FLOAT,             -- Training Effect (anaerobic)
    start_lat           DOUBLE PRECISION,
    start_lng           DOUBLE PRECISION,
    end_lat             DOUBLE PRECISION,
    end_lng             DOUBLE PRECISION,
    elevation_gain_m    FLOAT,
    avg_speed_mps       FLOAT,
    avg_cadence         INTEGER,
    avg_power           INTEGER,
    polyline            JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Intraday heart rate (one row per minute — good for detailed HR graphs)
CREATE TABLE IF NOT EXISTS heart_rate_intraday (
    recorded_at         TIMESTAMPTZ PRIMARY KEY,
    hr                  INT
);

-- Useful indexes for time-range queries in the dashboard
CREATE INDEX IF NOT EXISTS idx_activities_start     ON activities(start_time);
CREATE INDEX IF NOT EXISTS idx_hr_intraday_time     ON heart_rate_intraday(recorded_at);

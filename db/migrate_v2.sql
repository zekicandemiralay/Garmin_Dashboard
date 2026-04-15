-- Migration v2: add GPS + extra metrics to activities table
ALTER TABLE daily_summary
    ADD COLUMN IF NOT EXISTS min_hr_day INTEGER,
    ADD COLUMN IF NOT EXISTS max_hr_day INTEGER;

ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS start_lat    DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS start_lng    DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS elevation_gain_m FLOAT,
    ADD COLUMN IF NOT EXISTS avg_speed_mps    FLOAT,
    ADD COLUMN IF NOT EXISTS avg_cadence      INTEGER,
    ADD COLUMN IF NOT EXISTS avg_power        INTEGER,
    ADD COLUMN IF NOT EXISTS polyline         JSONB;

-- Migration v3: add end GPS coordinates to activities
ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS end_lat  DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS end_lng  DOUBLE PRECISION;

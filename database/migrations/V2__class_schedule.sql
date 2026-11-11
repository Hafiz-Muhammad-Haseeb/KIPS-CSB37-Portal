CREATE TABLE IF NOT EXISTS class_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(120),
  week_type VARCHAR(20) NOT NULL CHECK (week_type IN ('TEST','STUDY','NORMAL','OTHER')),
  week_number INTEGER CHECK (week_number IS NULL OR week_number BETWEEN 1 AND 5),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS ix_class_schedule_active_dates ON class_schedule(active,starts_on,ends_on);

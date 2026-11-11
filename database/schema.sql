-- KIPS-CSB37-Portal | PostgreSQL 17+
-- Financial records are append-oriented. Do not hard-delete students, fines or payments.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_number VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  class_name VARCHAR(40) NOT NULL DEFAULT 'CSB-37',
  academic_year VARCHAR(20),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  whatsapp_number_ciphertext BYTEA,
  whatsapp_number_last4 CHAR(4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('ADMIN','STUDENT')),
  student_id UUID UNIQUE REFERENCES students(id) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role = 'STUDENT' AND student_id IS NOT NULL) OR (role = 'ADMIN' AND student_id IS NULL))
);

CREATE TABLE IF NOT EXISTS fine_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  amount_pkr BIGINT NOT NULL CHECK (amount_pkr >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_policy_key_effective ON fine_policies(policy_key,effective_from);
CREATE INDEX IF NOT EXISTS ix_policy_effective ON fine_policies(policy_key,effective_from,effective_to);


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

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  attendance_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('PRESENT','ABSENT','LEAVE','EMERGENCY_LEAVE')),
  week_type VARCHAR(20) CHECK (week_type IN ('TEST','STUDY','NORMAL','SATURDAY','OTHER')),
  note TEXT,
  marked_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id,attendance_date)
);
CREATE INDEX IF NOT EXISTS ix_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS ix_attendance_student_date ON attendance(student_id,attendance_date DESC);

CREATE TABLE IF NOT EXISTS leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  leave_type VARCHAR(32) NOT NULL CHECK (leave_type IN ('EMERGENCY','MARRIAGE','MEDICAL','OTHER')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  CHECK(end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_leave_student ON leave_applications(student_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS ix_leave_status ON leave_applications(status,submitted_at);

CREATE TABLE IF NOT EXISTS private_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
  uploaded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('LEAVE_PROOF','ANNOUNCEMENT_ATTACHMENT','APPEAL_PROOF')),
  storage_key TEXT NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256_hex CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS leave_application_files (
  leave_application_id UUID NOT NULL REFERENCES leave_applications(id) ON DELETE RESTRICT,
  file_id UUID NOT NULL REFERENCES private_files(id) ON DELETE RESTRICT,
  PRIMARY KEY(leave_application_id,file_id)
);

CREATE TABLE IF NOT EXISTS fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  attendance_id UUID REFERENCES attendance(id) ON DELETE RESTRICT,
  policy_id UUID REFERENCES fine_policies(id) ON DELETE RESTRICT,
  category VARCHAR(100) NOT NULL,
  reason TEXT,
  occurrence_date DATE NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  week_type VARCHAR(20) CHECK (week_type IN ('TEST','STUDY','NORMAL','SATURDAY','OTHER')),
  assessed_amount_pkr BIGINT NOT NULL CHECK (assessed_amount_pkr >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIAL','PAID','WAIVED','CANCELLED')),
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_fines_student_occurrence ON fines(student_id,occurrence_date DESC);
CREATE INDEX IF NOT EXISTS ix_fines_status ON fines(status);
CREATE INDEX IF NOT EXISTS ix_fines_entry_date ON fines(entry_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fine_student_category_occurrence ON fines(student_id,category,occurrence_date) WHERE status <> 'CANCELLED';

CREATE TABLE IF NOT EXISTS fine_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id UUID NOT NULL REFERENCES fines(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  amount_pkr BIGINT NOT NULL CHECK (amount_pkr > 0),
  payment_method VARCHAR(40) NOT NULL,
  reference_number VARCHAR(120),
  receipt_number VARCHAR(60) NOT NULL UNIQUE,
  received_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key VARCHAR(120) UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_payment_fine ON fine_payments(fine_id,paid_at);
CREATE INDEX IF NOT EXISTS ix_payment_student ON fine_payments(student_id,paid_at DESC);

CREATE TABLE IF NOT EXISTS fine_waivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id UUID NOT NULL REFERENCES fines(id) ON DELETE RESTRICT,
  amount_pkr BIGINT NOT NULL CHECK (amount_pkr > 0),
  reason TEXT NOT NULL,
  approved_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id UUID NOT NULL REFERENCES fines(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  proof_file_id UUID REFERENCES private_files(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  decision_note TEXT,
  decided_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  amount_pkr BIGINT NOT NULL CHECK (amount_pkr > 0),
  expense_date DATE NOT NULL,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN ('HOLIDAY','EID_HOLIDAY','ACADEMIC','TEST','EVENT','EMERGENCY','GENERAL','OFFER','OTHER')),
  short_description VARCHAR(500),
  body TEXT NOT NULL,
  event_date DATE,
  start_time TIME,
  end_time TIME,
  instructions TEXT,
  publish_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','UNPUBLISHED','EXPIRED')),
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(end_time IS NULL OR start_time IS NULL OR end_time >= start_time)
);
CREATE INDEX IF NOT EXISTS ix_announcements_active ON announcements(status,publish_at,expires_at);
CREATE TABLE IF NOT EXISTS announcement_files (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
  file_id UUID NOT NULL REFERENCES private_files(id) ON DELETE RESTRICT,
  PRIMARY KEY(announcement_id,file_id)
);
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(announcement_id,user_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  event_type VARCHAR(40) NOT NULL,
  destination_last4 CHAR(4),
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEW_READY' CHECK (status IN ('PREVIEW_READY','QUEUED','SENT','DELIVERED','FAILED')),
  statement_snapshot JSONB NOT NULL,
  provider_message_id VARCHAR(180),
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_wa_student ON whatsapp_notifications(student_id,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs(entity_type,entity_id);

-- Initial rates copied from the supplied portal UI. Verify institutional approval before production.
INSERT INTO fine_policies(policy_key,display_name,amount_pkr,effective_from,conditions)
VALUES
 ('TEST_ABSENCE','Absent during Test',200,'2026-01-01','{"weekType":"TEST"}'),
 ('TEST_LEAVE','Leave during Test',200,'2026-01-01','{"weekType":"TEST"}'),
 ('STUDY_ABSENCE','Absent during Study Days',150,'2026-01-01','{"weekType":"STUDY"}'),
 ('SATURDAY_ABSENCE','Absent on Saturday',500,'2026-01-01','{"weekType":"SATURDAY"}'),
 ('EXCEEDED_STUDY_LEAVE','Exceeded Study Days Leave',150,'2026-01-01','{"monthlyLimit":2}'),
 ('LATE_ARRIVAL','Late Arrival',100,'2026-01-01','{}'),
 ('UNIFORM_VIOLATION','Uniform Violation',100,'2026-01-01','{}'),
 ('MOBILE_USAGE','Mobile Usage',300,'2026-01-01','{}'),
 ('STUDY_LEAVE_MONTHLY_LIMIT','Monthly study-days leave allowance',0,'2026-01-01','{"allowedDays":2}'),
 ('MARRIAGE_LEAVE_MAX','Marriage leave proof-based maximum',0,'2026-01-01','{"maximumDays":3,"proofRequired":true}')
ON CONFLICT DO NOTHING;

-- Security notes:
-- * Student data access must be scoped to JWT student_id in every controller/service.
-- * Never accept student_id from a student request body; derive it from the authenticated principal.
-- * Never store passwords, JWT secrets, DB passwords or WhatsApp API tokens in frontend code.
-- * Keep payment, waiver and fine correction history; use compensating records instead of deletion.

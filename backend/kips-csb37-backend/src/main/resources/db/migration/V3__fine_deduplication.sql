-- Prevent duplicate category/date fines for the same student; CANCELLED rows may be re-entered.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fine_student_category_occurrence ON fines(student_id,category,occurrence_date) WHERE status <> 'CANCELLED';

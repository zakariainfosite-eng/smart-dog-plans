-- Soft-delete column for operational_cases only.
-- agent_exclusions uses hard DELETE (no is_deleted column).

ALTER TABLE public.operational_cases
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_operational_cases_is_deleted
  ON public.operational_cases(is_deleted)
  WHERE is_deleted = false;

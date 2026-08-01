-- Soft delete for operational cases and agent exclusions.
ALTER TABLE public.operational_cases
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.agent_exclusions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_operational_cases_is_deleted
  ON public.operational_cases(is_deleted)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_agent_exclusions_is_deleted
  ON public.agent_exclusions(is_deleted)
  WHERE is_deleted = false;

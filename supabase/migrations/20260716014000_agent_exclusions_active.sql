-- Allow administrators to disable an exclusion without deleting it.
ALTER TABLE public.agent_exclusions
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_agent_exclusions_active ON public.agent_exclusions(active);

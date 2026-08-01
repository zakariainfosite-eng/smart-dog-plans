-- Female agents are independent of Sections A/B/C.
-- Clear any legacy section membership so they never appear in male section planning.
UPDATE public.agents
SET section_id = NULL
WHERE gender = 'female'
  AND section_id IS NOT NULL;

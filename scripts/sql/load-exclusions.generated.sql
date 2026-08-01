SELECT agent_id, exclusion_type
FROM public.agent_exclusions
WHERE active = true
  AND start_date <= '2026-07-16'::date
  AND end_date >= '2026-07-16'::date
  AND agent_id IN ('b18b7bcb-11b8-4e2f-9eb7-82b51044be8e', '10fe441e-bd68-4c3d-85d5-065ca35fbf88', 'd8b01ea8-bc71-4acf-aa98-f9f953555174', '3253360b-0514-46e0-899d-995860ae9234', '65e75021-9805-4c26-8e9d-f623f1d81352', '0a5e0dcf-482a-4f26-ba89-f239d7ccf8cc', 'af9ed8a4-97ac-4e0f-8a32-1e528dc2e066', '584c6c75-7b72-4bbf-8749-58d9d52e65e6', 'fd7197e3-6e13-4e49-9feb-257ffb8dee1d', '1fcf1ad7-531b-4a08-946b-d15e5ac69ddd', 'cff01246-75d1-4bc3-a127-280a96940eee', 'd8f8039a-353a-4303-a8e0-333233920fae', '9d15c15e-473e-4052-9945-e0f8c6e2a47b');
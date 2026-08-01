-- End-to-end insert test (same columns as operationalConfigToRowPayload)
WITH inserted AS (
  INSERT INTO public.checkpoints (
    name, active, operating_days, day_shift_enabled, night_shift_enabled,
    day_explosives, day_narcotics, night_explosives, night_narcotics,
    female_policy, night_only, required_drugs, required_explosives, allowed_gender
  ) VALUES (
    '__migration_verify__', true, '{1,2,3,4,5,6,7}', true, false,
    1, 0, 0, 0, 'allowed', false, 0, 1, 'all'
  )
  RETURNING id, name, day_explosives, female_policy
)
SELECT * FROM inserted;

DELETE FROM public.checkpoints WHERE name = '__migration_verify__';

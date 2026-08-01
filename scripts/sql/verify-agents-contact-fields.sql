-- Verify agent contact fields can be written (runs as DB owner via Supabase CLI).
-- Safe: uses a unique professional_number and cleans up after itself.

DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_pro TEXT := 'VERIFY-' || floor(extract(epoch from clock_timestamp()) * 1000)::text;
BEGIN
  INSERT INTO public.agents (
    id, first_name, last_name, professional_number, grade, gender,
    phone, address, observations, photo_url, active
  ) VALUES (
    v_id, 'Verify', 'Contact', v_pro, 'Agent', 'male',
    '+212600000000', '123 Test Street', 'Verification run', NULL, false
  );

  UPDATE public.agents
  SET
    phone = '+212611111111',
    address = '456 Updated Avenue',
    observations = 'Updated notes',
    photo_url = 'https://example.com/photo.jpg'
  WHERE id = v_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.agents
    WHERE id = v_id
      AND phone = '+212611111111'
      AND address = '456 Updated Avenue'
      AND observations = 'Updated notes'
      AND photo_url = 'https://example.com/photo.jpg'
  ) THEN
    RAISE EXCEPTION 'Contact field values did not persist after update';
  END IF;

  DELETE FROM public.agents WHERE id = v_id;
END $$;

SELECT 'PASS: agents phone/address/observations/photo_url create+update works' AS result;

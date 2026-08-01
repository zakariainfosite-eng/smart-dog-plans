-- Verify Dogs module CRUD against all profile columns.

DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.dogs (
    id,
    name,
    gender,
    specialty,
    status,
    active,
    photo_url,
    breed,
    microchip_number,
    date_of_birth,
    training_level,
    veterinary_notes,
    observations,
    assignment_date,
    vaccination_info,
    health_status
  ) VALUES (
    v_id,
    'Schema Verify Dog',
    'male',
    'narcotics',
    'available',
    false,
    'https://example.com/dog.jpg',
    'Malinois',
    'CHIP-12345',
    '2020-01-15',
    'Advanced',
    'Healthy',
    'Test observations',
    '2024-06-01',
    'Rabies up to date',
    'Good'
  );

  UPDATE public.dogs
  SET
    training_level = 'Expert',
    assignment_date = '2025-01-01',
    observations = 'Updated observations'
  WHERE id = v_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dogs
    WHERE id = v_id
      AND training_level = 'Expert'
      AND assignment_date = DATE '2025-01-01'
      AND observations = 'Updated observations'
  ) THEN
    RAISE EXCEPTION 'Dog profile column verification failed';
  END IF;

  DELETE FROM public.dogs WHERE id = v_id;
END $$;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dogs'
  AND column_name IN (
    'photo_url',
    'breed',
    'microchip_number',
    'date_of_birth',
    'training_level',
    'veterinary_notes',
    'observations',
    'assignment_date',
    'vaccination_info',
    'health_status'
  )
ORDER BY column_name;

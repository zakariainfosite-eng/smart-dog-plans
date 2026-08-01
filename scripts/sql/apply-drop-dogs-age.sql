-- Drop dogs.age column (age is computed from date_of_birth in the app).

ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_age_range_check;

ALTER TABLE public.dogs
  DROP COLUMN IF EXISTS age;

NOTIFY pgrst, 'reload schema';

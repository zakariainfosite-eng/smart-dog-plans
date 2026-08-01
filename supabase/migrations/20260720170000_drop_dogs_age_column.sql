-- Remove stored age column; age is derived from date_of_birth in the application.

ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_age_range_check;

ALTER TABLE public.dogs
  DROP COLUMN IF EXISTS age;

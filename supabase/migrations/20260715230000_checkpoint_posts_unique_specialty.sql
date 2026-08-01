-- One checkpoint_post per (checkpoint, specialty). Merge existing duplicates, then enforce uniqueness.

-- 1. Reassign rotation_history from duplicate posts to the keeper row.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER w AS keeper_id,
    ROW_NUMBER() OVER w AS rn
  FROM public.checkpoint_posts
  WINDOW w AS (
    PARTITION BY checkpoint_id, specialty_required
    ORDER BY required_agents DESC, created_at ASC
  )
)
UPDATE public.rotation_history rh
SET checkpoint_post_id = r.keeper_id
FROM ranked r
WHERE rh.checkpoint_post_id = r.id
  AND r.rn > 1;

-- 2. Reassign planning_assignments from duplicate posts to the keeper row.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER w AS keeper_id,
    ROW_NUMBER() OVER w AS rn
  FROM public.checkpoint_posts
  WINDOW w AS (
    PARTITION BY checkpoint_id, specialty_required
    ORDER BY required_agents DESC, created_at ASC
  )
)
UPDATE public.planning_assignments pa
SET checkpoint_post_id = r.keeper_id
FROM ranked r
WHERE pa.checkpoint_post_id = r.id
  AND r.rn > 1;

-- 3. Set keeper required_agents to the max in each duplicate group.
WITH max_agents AS (
  SELECT checkpoint_id, specialty_required, MAX(required_agents) AS max_req
  FROM public.checkpoint_posts
  GROUP BY checkpoint_id, specialty_required
),
keepers AS (
  SELECT DISTINCT ON (checkpoint_id, specialty_required)
    id,
    checkpoint_id,
    specialty_required
  FROM public.checkpoint_posts
  ORDER BY checkpoint_id, specialty_required, required_agents DESC, created_at ASC
)
UPDATE public.checkpoint_posts cp
SET required_agents = m.max_req
FROM max_agents m
JOIN keepers k
  ON k.checkpoint_id = m.checkpoint_id
 AND k.specialty_required = m.specialty_required
WHERE cp.id = k.id;

-- 4. Delete duplicate rows (keepers remain).
DELETE FROM public.checkpoint_posts
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY checkpoint_id, specialty_required
        ORDER BY required_agents DESC, created_at ASC
      ) AS rn
    FROM public.checkpoint_posts
  ) ranked
  WHERE rn > 1
);

-- 5. Prevent future duplicates.
ALTER TABLE public.checkpoint_posts
  DROP CONSTRAINT IF EXISTS checkpoint_posts_checkpoint_id_specialty_required_key;

ALTER TABLE public.checkpoint_posts
  ADD CONSTRAINT checkpoint_posts_checkpoint_id_specialty_required_key
  UNIQUE (checkpoint_id, specialty_required);

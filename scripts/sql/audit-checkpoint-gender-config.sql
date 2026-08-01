SELECT
  c.name AS checkpoint,
  p.specialty_required,
  p.allowed_gender AS post_gender,
  c.allowed_gender AS checkpoint_gender
FROM public.checkpoint_posts p
JOIN public.checkpoints c ON c.id = p.checkpoint_id
WHERE c.active = true AND p.active = true
ORDER BY c.name, p.specialty_required;

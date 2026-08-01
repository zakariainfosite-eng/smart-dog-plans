SELECT c.id, c.name, c.night_only, c.active, c.allowed_gender,
  COALESCE(
    json_agg(
      json_build_object(
        'id', p.id,
        'specialty_required', p.specialty_required,
        'required_agents', p.required_agents,
        'active', p.active,
        'allowed_gender', p.allowed_gender
      )
      ORDER BY p.specialty_required, p.id
    ) FILTER (WHERE p.id IS NOT NULL),
    '[]'::json
  ) AS posts
FROM public.checkpoints c
LEFT JOIN public.checkpoint_posts p ON p.checkpoint_id = c.id
WHERE c.active = true
GROUP BY c.id
ORDER BY c.name;

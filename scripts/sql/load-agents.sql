SELECT a.id, a.first_name, a.last_name, a.professional_number, a.gender, a.active, a.section_id, a.dog_id,
  json_build_object(
    'id', d.id,
    'name', d.name,
    'specialty', d.specialty,
    'status', d.status,
    'active', d.active
  ) AS dogs
FROM public.agents a
LEFT JOIN public.dogs d ON d.id = a.dog_id
WHERE a.active = true
ORDER BY a.last_name, a.first_name;

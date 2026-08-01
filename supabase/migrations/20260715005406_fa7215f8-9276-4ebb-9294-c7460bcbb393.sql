
-- Allow HQ Reserve rows (no checkpoint post)
ALTER TABLE public.planning_assignments ALTER COLUMN checkpoint_post_id DROP NOT NULL;
ALTER TABLE public.rotation_history ALTER COLUMN checkpoint_post_id DROP NOT NULL;

ALTER TABLE public.planning_assignments ADD COLUMN IF NOT EXISTS is_hq_reserve boolean NOT NULL DEFAULT false;
ALTER TABLE public.rotation_history ADD COLUMN IF NOT EXISTS is_hq_reserve boolean NOT NULL DEFAULT false;

-- One planning per (section, date)
CREATE UNIQUE INDEX IF NOT EXISTS planning_section_date_uidx
  ON public.planning (section_id, planning_date);

-- Cascade delete assignments when a planning is removed (replace flow)
ALTER TABLE public.planning_assignments
  DROP CONSTRAINT IF EXISTS planning_assignments_planning_id_fkey;
ALTER TABLE public.planning_assignments
  ADD CONSTRAINT planning_assignments_planning_id_fkey
  FOREIGN KEY (planning_id) REFERENCES public.planning(id) ON DELETE CASCADE;

-- Grants (authenticated + service_role)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning TO authenticated;
GRANT ALL ON public.planning TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_assignments TO authenticated;
GRANT ALL ON public.planning_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotation_history TO authenticated;
GRANT ALL ON public.rotation_history TO service_role;

-- Policies: any authenticated user of the app can manage planning data
DROP POLICY IF EXISTS "Authenticated can view planning" ON public.planning;
DROP POLICY IF EXISTS "Authenticated can insert planning" ON public.planning;
DROP POLICY IF EXISTS "Authenticated can update planning" ON public.planning;
DROP POLICY IF EXISTS "Authenticated can delete planning" ON public.planning;
CREATE POLICY "Authenticated can view planning" ON public.planning FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert planning" ON public.planning FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update planning" ON public.planning FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete planning" ON public.planning FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can view planning_assignments" ON public.planning_assignments;
DROP POLICY IF EXISTS "Authenticated can insert planning_assignments" ON public.planning_assignments;
DROP POLICY IF EXISTS "Authenticated can update planning_assignments" ON public.planning_assignments;
DROP POLICY IF EXISTS "Authenticated can delete planning_assignments" ON public.planning_assignments;
CREATE POLICY "Authenticated can view planning_assignments" ON public.planning_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert planning_assignments" ON public.planning_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update planning_assignments" ON public.planning_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete planning_assignments" ON public.planning_assignments FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert rotation_history" ON public.rotation_history;
DROP POLICY IF EXISTS "Authenticated can update rotation_history" ON public.rotation_history;
DROP POLICY IF EXISTS "Authenticated can delete rotation_history" ON public.rotation_history;
CREATE POLICY "Authenticated can insert rotation_history" ON public.rotation_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update rotation_history" ON public.rotation_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete rotation_history" ON public.rotation_history FOR DELETE TO authenticated USING (true);

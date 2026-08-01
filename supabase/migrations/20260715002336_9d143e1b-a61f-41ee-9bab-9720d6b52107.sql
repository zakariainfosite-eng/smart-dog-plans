
CREATE POLICY "Authenticated can view agent_exclusions" ON public.agent_exclusions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create agent_exclusions" ON public.agent_exclusions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update agent_exclusions" ON public.agent_exclusions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete agent_exclusions" ON public.agent_exclusions
  FOR DELETE TO authenticated USING (true);

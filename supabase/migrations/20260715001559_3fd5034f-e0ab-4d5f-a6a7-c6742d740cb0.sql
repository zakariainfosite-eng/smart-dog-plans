
CREATE POLICY "Authenticated can view sections" ON public.sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create sections" ON public.sections
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update sections" ON public.sections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete sections" ON public.sections
  FOR DELETE TO authenticated USING (true);

-- Also allow reading agents (needed for count of assigned agents)
CREATE POLICY "Authenticated can view agents" ON public.agents
  FOR SELECT TO authenticated USING (true);

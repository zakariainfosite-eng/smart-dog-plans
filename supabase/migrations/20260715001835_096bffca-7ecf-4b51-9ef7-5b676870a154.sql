
CREATE POLICY "Authenticated can view dogs" ON public.dogs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create dogs" ON public.dogs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update dogs" ON public.dogs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete dogs" ON public.dogs
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can create agents" ON public.agents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update agents" ON public.agents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete agents" ON public.agents
  FOR DELETE TO authenticated USING (true);

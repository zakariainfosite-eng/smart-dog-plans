
CREATE POLICY "Authenticated can view checkpoints" ON public.checkpoints
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create checkpoints" ON public.checkpoints
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update checkpoints" ON public.checkpoints
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete checkpoints" ON public.checkpoints
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can view checkpoint_posts" ON public.checkpoint_posts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create checkpoint_posts" ON public.checkpoint_posts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update checkpoint_posts" ON public.checkpoint_posts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete checkpoint_posts" ON public.checkpoint_posts
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can view rotation_history" ON public.rotation_history
  FOR SELECT TO authenticated USING (true);

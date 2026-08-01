SELECT schemaname, tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('dogs', 'agents')
ORDER BY tablename, policyname;

-- Consolidate duplicate operational case tables into public.operational_cases.
-- Safe to run multiple times. Does nothing when duplicates are absent.

DO $$
DECLARE
  canonical_table constant text := 'operational_cases';
  duplicate_table text;
  duplicate_tables text[] := ARRAY['operational_case', 'operation_cases', 'cases_operationnelles'];
  shared_columns text;
  migrate_sql text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = canonical_table
  ) THEN
    RAISE EXCEPTION 'Canonical table public.% is missing. Apply operational_cases migrations first.', canonical_table;
  END IF;

  FOREACH duplicate_table IN ARRAY duplicate_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = duplicate_table
    ) THEN
      CONTINUE;
    END IF;

    SELECT string_agg(format('%I', canonical_col.column_name), ', ' ORDER BY canonical_col.ordinal_position)
    INTO shared_columns
    FROM information_schema.columns canonical_col
    WHERE canonical_col.table_schema = 'public'
      AND canonical_col.table_name = canonical_table
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns duplicate_col
        WHERE duplicate_col.table_schema = 'public'
          AND duplicate_col.table_name = duplicate_table
          AND duplicate_col.column_name = canonical_col.column_name
      );

    IF shared_columns IS NOT NULL AND shared_columns <> '' THEN
      migrate_sql := format(
        'INSERT INTO public.%I (%s) SELECT %s FROM public.%I ON CONFLICT (case_number) DO NOTHING',
        canonical_table,
        shared_columns,
        shared_columns,
        duplicate_table
      );

      BEGIN
        EXECUTE migrate_sql;
      EXCEPTION
        WHEN undefined_column OR undefined_table THEN
          migrate_sql := format(
            'INSERT INTO public.%I (%s) SELECT %s FROM public.%I WHERE NOT EXISTS (
               SELECT 1 FROM public.%I c WHERE c.case_number = %I.case_number
             )',
            canonical_table,
            shared_columns,
            shared_columns,
            duplicate_table,
            canonical_table,
            duplicate_table
          );
          EXECUTE migrate_sql;
      END;
    END IF;

    EXECUTE format('DROP TABLE public.%I CASCADE', duplicate_table);
  END LOOP;
END $$;

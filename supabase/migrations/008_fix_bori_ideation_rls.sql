-- ═══════════════════════════════════════════════════════════════════════════
-- 008_fix_bori_ideation_rls.sql
--
-- Enables correct RLS on bori_ideation.
-- Uses dynamic SQL so it works regardless of whether shared_with / edit_access
-- are stored as uuid[], text[], or jsonb.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE bori_ideation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol            TEXT;
  sw_type        TEXT;
  ea_type        TEXT;
  sw_check       TEXT;
  ea_check       TEXT;
BEGIN
  -- 1. Drop every existing policy regardless of name
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'bori_ideation' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bori_ideation', pol);
  END LOOP;

  -- 2. Look up the actual column types
  SELECT udt_name INTO sw_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'bori_ideation'
    AND column_name  = 'shared_with';

  SELECT udt_name INTO ea_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'bori_ideation'
    AND column_name  = 'edit_access';

  -- 3. Choose the right membership expression per column type
  IF sw_type = 'jsonb' THEN
    sw_check := 'shared_with @> to_jsonb(ARRAY[auth.uid()::text])';
  ELSE
    -- uuid[] or text[] — cast both sides to text to avoid type mismatches
    sw_check := 'auth.uid()::text = ANY(shared_with::text[])';
  END IF;

  IF ea_type = 'jsonb' THEN
    ea_check := 'edit_access @> to_jsonb(ARRAY[auth.uid()::text])';
  ELSE
    ea_check := 'auth.uid()::text = ANY(edit_access::text[])';
  END IF;

  -- 4. Create policies using the correct expressions
  EXECUTE format(
    $p$CREATE POLICY "notes: read own and shared"
      ON bori_ideation FOR SELECT
      USING (user_id = auth.uid() OR %s OR %s)$p$,
    sw_check, ea_check
  );

  EXECUTE format(
    $p$CREATE POLICY "notes: update"
      ON bori_ideation FOR UPDATE
      USING (user_id = auth.uid() OR %s)$p$,
    ea_check
  );

  EXECUTE $p$CREATE POLICY "notes: insert"
    ON bori_ideation FOR INSERT
    WITH CHECK (user_id = auth.uid())$p$;

  EXECUTE $p$CREATE POLICY "notes: delete"
    ON bori_ideation FOR DELETE
    USING (user_id = auth.uid())$p$;

END;
$$;

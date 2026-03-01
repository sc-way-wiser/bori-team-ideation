-- ═══════════════════════════════════════════════════════════════════════════
-- 006_fix_rls_recursion.sql
--
-- The INSERT and UPDATE policies added in 005 query ideation_folders inside
-- their own WITH CHECK / USING expressions, causing "infinite recursion
-- detected in policy for relation ideation_folders".
--
-- Fix: replace the self-referential EXISTS(...) with a SECURITY DEFINER
-- function that looks up the parent row without triggering RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the recursive policies from 005
DROP POLICY IF EXISTS "folders: shared editors can insert sub-folders" ON ideation_folders;
DROP POLICY IF EXISTS "folders: shared editors can update"             ON ideation_folders;

-- ── Helper function (SECURITY DEFINER bypasses RLS on the parent lookup) ──
CREATE OR REPLACE FUNCTION ideation_folder_parent_allows_edit(
  p_parent_id UUID,
  p_user_id   UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   ideation_folders
    WHERE  id = p_parent_id
      AND  p_user_id = ANY(edit_access)
  );
$$;

-- ── Recreated INSERT policy (no recursion) ─────────────────────────────────
CREATE POLICY "folders: shared editors can insert sub-folders"
  ON ideation_folders FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    OR ideation_folder_parent_allows_edit(parent_id, auth.uid())
  );

-- ── Recreated UPDATE policy (no recursion) ─────────────────────────────────
CREATE POLICY "folders: shared editors can update"
  ON ideation_folders FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR ideation_folder_parent_allows_edit(parent_id, auth.uid())
  );

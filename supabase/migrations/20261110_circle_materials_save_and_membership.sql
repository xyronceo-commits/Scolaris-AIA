-- ========================================================================
-- KORSIQ MIGRATION: CIRCLE SAVED MATERIALS, JSONB MEMBERSHIP & SEARCH RLS
-- Migration: 20261110_circle_materials_save_and_membership.sql
-- ========================================================================

-- 1. Fix public.is_circle_member so members stored in study_groups.members JSONB
--    (as well as circle_members table, circle owners, and public/general circles) are recognized
CREATE OR REPLACE FUNCTION public.is_circle_member(p_circle_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = p_circle_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.study_groups sg
    WHERE sg.id = p_circle_id
      AND (
        sg.type = 'general'
        OR sg.visibility = 'public'
        OR sg.owner_id = p_user_id::text
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(sg.members, '[]'::jsonb)) AS elem
          WHERE elem->>'userId' = p_user_id::text
             OR elem #>> '{}' = p_user_id::text
        )
      )
  );
$$;

-- 2. Allow circle_saved_posts.post_id to store ANY post or material ID (threads, materials, resources)
DO $$ BEGIN
  ALTER TABLE IF EXISTS public.circle_saved_posts
    DROP CONSTRAINT IF EXISTS circle_saved_posts_post_id_fkey;

  ALTER TABLE IF EXISTS public.circle_saved_posts
    ALTER COLUMN post_id TYPE TEXT USING post_id::text;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'circle_saved_posts post_id migration note: %', SQLERRM;
END $$;

-- 3. Refresh RLS on circle_saved_posts so members can save threads AND materials/files
ALTER TABLE public.circle_saved_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved posts" ON public.circle_saved_posts;
CREATE POLICY "Users can view their own saved posts"
  ON public.circle_saved_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save circle posts" ON public.circle_saved_posts;
CREATE POLICY "Users can save circle posts"
  ON public.circle_saved_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_circle_member(circle_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can unsave posts" ON public.circle_saved_posts;
CREATE POLICY "Users can unsave posts"
  ON public.circle_saved_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

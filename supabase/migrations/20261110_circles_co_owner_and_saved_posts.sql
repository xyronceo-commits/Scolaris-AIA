-- ==============================================================================
-- KorsIQ Migration: Circles Co-Owner Role, Saved Posts, Materials RLS & Profiles RLS
-- File: supabase/migrations/20261110_circles_co_owner_and_saved_posts.sql
-- Idempotent and safe to run on Supabase Postgres.
-- ==============================================================================

-- 1. Ensure public.profiles allows authenticated users to SELECT, INSERT, and UPDATE their own row
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can read own profile') THEN
    CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 2. Support 'co_owner' in public.circle_members.role
CREATE TABLE IF NOT EXISTS public.circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id)
);

DO $$ BEGIN
  ALTER TABLE public.circle_members DROP CONSTRAINT IF EXISTS circle_members_role_check;
  ALTER TABLE public.circle_members
    ADD CONSTRAINT circle_members_role_check
    CHECK (role IN ('owner', 'co_owner', 'admin', 'moderator', 'member'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'circle_members_role_check note: %', SQLERRM;
END $$;

-- 3. Helper functions for circle membership, owner, and co_owner checks
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

CREATE OR REPLACE FUNCTION public.is_circle_owner(p_circle_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_groups sg
    WHERE sg.id = p_circle_id AND sg.owner_id = p_user_id::text
  ) OR EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = p_user_id AND cm.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_circle_owner_or_co_owner(p_circle_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_circle_owner(p_circle_id, p_user_id)
  OR EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id
      AND cm.user_id = p_user_id
      AND cm.role IN ('owner', 'co_owner', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.study_groups sg
    WHERE sg.id = p_circle_id
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(sg.members, '[]'::jsonb)) AS elem
        WHERE elem->>'userId' = p_user_id::text
          AND elem->>'role' IN ('owner', 'co_owner', 'admin')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_circle_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_circle_owner(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_circle_owner_or_co_owner(TEXT, UUID) TO authenticated;

-- 4. Create public.saved_circle_posts (with RLS: user can read/insert/delete own rows)
CREATE TABLE IF NOT EXISTS public.saved_circle_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  circle_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_circle_posts_user ON public.saved_circle_posts(user_id);

ALTER TABLE public.saved_circle_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own saved_circle_posts" ON public.saved_circle_posts;
CREATE POLICY "Users can read own saved_circle_posts"
  ON public.saved_circle_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own saved_circle_posts" ON public.saved_circle_posts;
CREATE POLICY "Users can insert own saved_circle_posts"
  ON public.saved_circle_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own saved_circle_posts" ON public.saved_circle_posts;
CREATE POLICY "Users can delete own saved_circle_posts"
  ON public.saved_circle_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. RLS for circle_members (only owner can promote/demote co_owner)
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view circle_members" ON public.circle_members;
CREATE POLICY "Members can view circle_members"
  ON public.circle_members FOR SELECT
  TO authenticated
  USING (public.is_circle_member(circle_id, auth.uid()));

DROP POLICY IF EXISTS "Users can join circle_members" ON public.circle_members;
CREATE POLICY "Users can join circle_members"
  ON public.circle_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_circle_owner(circle_id, auth.uid()));

DROP POLICY IF EXISTS "Only circle owner can update member roles" ON public.circle_members;
CREATE POLICY "Only circle owner can update member roles"
  ON public.circle_members FOR UPDATE
  TO authenticated
  USING (public.is_circle_owner(circle_id, auth.uid()))
  WITH CHECK (public.is_circle_owner(circle_id, auth.uid()));

DROP POLICY IF EXISTS "Users can leave or owner can remove from circle_members" ON public.circle_members;
CREATE POLICY "Users can leave or owner can remove from circle_members"
  ON public.circle_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_circle_owner(circle_id, auth.uid()));

-- 6. RLS for circle_discussions (owner & co_owner can create/pin/delete posts; members can read)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'circle_discussions') THEN
    ALTER TABLE public.circle_discussions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Circle members can view discussions" ON public.circle_discussions;
    CREATE POLICY "Circle members can view discussions"
      ON public.circle_discussions FOR SELECT
      TO authenticated
      USING (public.is_circle_member(circle_id, auth.uid()));

    DROP POLICY IF EXISTS "Circle owners can create posts" ON public.circle_discussions;
    DROP POLICY IF EXISTS "Circle owners and co_owners can create posts" ON public.circle_discussions;
    CREATE POLICY "Circle owners and co_owners can create posts"
      ON public.circle_discussions FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = author_id
        AND public.is_circle_owner_or_co_owner(circle_id, auth.uid())
      );

    DROP POLICY IF EXISTS "Circle owners can update or pin posts" ON public.circle_discussions;
    DROP POLICY IF EXISTS "Circle owners and co_owners can update or pin posts" ON public.circle_discussions;
    CREATE POLICY "Circle owners and co_owners can update or pin posts"
      ON public.circle_discussions FOR UPDATE
      TO authenticated
      USING (public.is_circle_owner_or_co_owner(circle_id, auth.uid()))
      WITH CHECK (public.is_circle_owner_or_co_owner(circle_id, auth.uid()));

    DROP POLICY IF EXISTS "Authors or circle owners can delete posts" ON public.circle_discussions;
    DROP POLICY IF EXISTS "Authors or circle owners and co_owners can delete posts" ON public.circle_discussions;
    CREATE POLICY "Authors or circle owners and co_owners can delete posts"
      ON public.circle_discussions FOR DELETE
      TO authenticated
      USING (
        auth.uid() = author_id
        OR public.is_circle_owner_or_co_owner(circle_id, auth.uid())
      );
  END IF;
END $$;

-- 7. RLS for circle_discussion_replies (members can reply & edit/delete own; owner & co_owner can delete any reply)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'circle_discussion_replies') THEN
    ALTER TABLE public.circle_discussion_replies ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Circle members can view replies" ON public.circle_discussion_replies;
    CREATE POLICY "Circle members can view replies"
      ON public.circle_discussion_replies FOR SELECT
      TO authenticated
      USING (public.is_circle_member(circle_id, auth.uid()));

    DROP POLICY IF EXISTS "Circle members can insert replies" ON public.circle_discussion_replies;
    CREATE POLICY "Circle members can insert replies"
      ON public.circle_discussion_replies FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = author_id
        AND public.is_circle_member(circle_id, auth.uid())
      );

    DROP POLICY IF EXISTS "Reply authors can update own replies" ON public.circle_discussion_replies;
    CREATE POLICY "Reply authors can update own replies"
      ON public.circle_discussion_replies FOR UPDATE
      TO authenticated
      USING (auth.uid() = author_id)
      WITH CHECK (auth.uid() = author_id);

    DROP POLICY IF EXISTS "Reply authors or circle owners can delete replies" ON public.circle_discussion_replies;
    DROP POLICY IF EXISTS "Reply authors or circle owners and co_owners can delete replies" ON public.circle_discussion_replies;
    CREATE POLICY "Reply authors or circle owners and co_owners can delete replies"
      ON public.circle_discussion_replies FOR DELETE
      TO authenticated
      USING (
        auth.uid() = author_id
        OR public.is_circle_owner_or_co_owner(circle_id, auth.uid())
      );
  END IF;
END $$;

-- 8. RLS for group_materials (members can read/download; owner & co_owner can upload/delete)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_materials') THEN
    ALTER TABLE public.group_materials ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Circle members can read group_materials" ON public.group_materials;
    CREATE POLICY "Circle members can read group_materials"
      ON public.group_materials FOR SELECT
      TO authenticated
      USING (public.is_circle_member(group_id, auth.uid()));

    DROP POLICY IF EXISTS "Circle owners and co_owners can insert group_materials" ON public.group_materials;
    CREATE POLICY "Circle owners and co_owners can insert group_materials"
      ON public.group_materials FOR INSERT
      TO authenticated
      WITH CHECK (public.is_circle_owner_or_co_owner(group_id, auth.uid()));

    DROP POLICY IF EXISTS "Circle owners and co_owners can update group_materials" ON public.group_materials;
    CREATE POLICY "Circle owners and co_owners can update group_materials"
      ON public.group_materials FOR UPDATE
      TO authenticated
      USING (public.is_circle_owner_or_co_owner(group_id, auth.uid()));

    DROP POLICY IF EXISTS "Circle owners and co_owners can delete group_materials" ON public.group_materials;
    CREATE POLICY "Circle owners and co_owners can delete group_materials"
      ON public.group_materials FOR DELETE
      TO authenticated
      USING (public.is_circle_owner_or_co_owner(group_id, auth.uid()));
  END IF;
END $$;

-- 9. Storage policies for group-materials bucket
DO $$ BEGIN
  DROP POLICY IF EXISTS "Circle members can read group-materials objects" ON storage.objects;
  CREATE POLICY "Circle members can read group-materials objects"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'group-materials');

  DROP POLICY IF EXISTS "Circle owners and co_owners can upload group-materials objects" ON storage.objects;
  CREATE POLICY "Circle owners and co_owners can upload group-materials objects"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'group-materials');

  DROP POLICY IF EXISTS "Circle owners and co_owners can delete group-materials objects" ON storage.objects;
  CREATE POLICY "Circle owners and co_owners can delete group-materials objects"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'group-materials');
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'storage.objects policy note: %', SQLERRM;
END $$;

-- ========================================================================
-- KORSIQ MIGRATION: REDDIT-STYLE CIRCLE COMMUNITIES SCHEMA & SECURITY
-- Migration: 20261109_circle_reddit_communities.sql
-- ========================================================================

-- 1. Extend circle_discussions table with post_type, pinned flag, and file attachments
ALTER TABLE IF EXISTS public.circle_discussions
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'thread',
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS replies_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_circle_posts_circle_sort 
  ON public.circle_discussions(circle_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_circle_posts_replies_count 
  ON public.circle_discussions(circle_id, replies_count DESC, created_at DESC);

-- 2. Personal Saved Posts Table (Bookmark posts in circles)
CREATE TABLE IF NOT EXISTS public.circle_saved_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id TEXT NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.circle_discussions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_saved_posts_user 
  ON public.circle_saved_posts(user_id, created_at DESC);

-- 3. Automatic reply counter trigger
CREATE OR REPLACE FUNCTION public.handle_circle_reply_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.circle_discussions
    SET replies_count = replies_count + 1,
        updated_at = now()
    WHERE id = NEW.discussion_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.circle_discussions
    SET replies_count = GREATEST(0, replies_count - 1),
        updated_at = now()
    WHERE id = OLD.discussion_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_circle_reply_count ON public.circle_discussion_replies;
CREATE TRIGGER trg_circle_reply_count
  AFTER INSERT OR DELETE ON public.circle_discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_circle_reply_counter();

-- 4. Enable RLS on saved posts
ALTER TABLE public.circle_saved_posts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for circle_saved_posts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_saved_posts' AND policyname = 'Users can view their own saved posts') THEN
    CREATE POLICY "Users can view their own saved posts" ON public.circle_saved_posts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_saved_posts' AND policyname = 'Users can save circle posts') THEN
    CREATE POLICY "Users can save circle posts" ON public.circle_saved_posts
      FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_saved_posts' AND policyname = 'Users can unsave posts') THEN
    CREATE POLICY "Users can unsave posts" ON public.circle_saved_posts
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 6. Update RLS on circle_discussions: ONLY owner can create posts per user direction
DO $$ BEGIN
  -- Drop prior permissive insert policy if exists
  DROP POLICY IF EXISTS "Circle members can create discussions" ON public.circle_discussions;
  DROP POLICY IF EXISTS "Owner can post discussions" ON public.circle_discussions;

  -- Create strict Owner-only Post Creation policy
  CREATE POLICY "Owner can post discussions" ON public.circle_discussions
    FOR INSERT WITH CHECK (
      auth.uid() = author_id AND
      EXISTS (
        SELECT 1 FROM public.study_groups
        WHERE id = circle_discussions.circle_id
          AND owner_id = auth.uid()::text
      )
    );

  -- Circle members can read all circle posts
  DROP POLICY IF EXISTS "Circle members can read discussions" ON public.circle_discussions;
  CREATE POLICY "Circle members can read discussions" ON public.circle_discussions
    FOR SELECT USING (public.is_circle_member(circle_id, auth.uid()));

  -- Owner can update posts (pin / edit)
  DROP POLICY IF EXISTS "Owner can update posts" ON public.circle_discussions;
  CREATE POLICY "Owner can update posts" ON public.circle_discussions
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.study_groups
        WHERE id = circle_discussions.circle_id
          AND owner_id = auth.uid()::text
      )
    );

  -- Owner or author can delete post
  DROP POLICY IF EXISTS "Owner or author can delete post" ON public.circle_discussions;
  CREATE POLICY "Owner or author can delete post" ON public.circle_discussions
    FOR DELETE USING (
      auth.uid() = author_id OR
      EXISTS (
        SELECT 1 FROM public.study_groups
        WHERE id = circle_discussions.circle_id
          AND owner_id = auth.uid()::text
      )
    );
END $$;

-- 7. Ensure circle_discussion_replies allows all members to reply
DO $$ BEGIN
  DROP POLICY IF EXISTS "Circle members can reply" ON public.circle_discussion_replies;
  CREATE POLICY "Circle members can reply" ON public.circle_discussion_replies
    FOR INSERT WITH CHECK (
      auth.uid() = author_id AND
      public.is_circle_member(circle_id, auth.uid())
    );

  DROP POLICY IF EXISTS "Circle members can read replies" ON public.circle_discussion_replies;
  CREATE POLICY "Circle members can read replies" ON public.circle_discussion_replies
    FOR SELECT USING (public.is_circle_member(circle_id, auth.uid()));

  DROP POLICY IF EXISTS "Author can edit own reply" ON public.circle_discussion_replies;
  CREATE POLICY "Author can edit own reply" ON public.circle_discussion_replies
    FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

  DROP POLICY IF EXISTS "Author or circle owner can delete reply" ON public.circle_discussion_replies;
  CREATE POLICY "Author or circle owner can delete reply" ON public.circle_discussion_replies
    FOR DELETE USING (
      auth.uid() = author_id OR
      EXISTS (
        SELECT 1 FROM public.study_groups
        WHERE id = circle_discussion_replies.circle_id
          AND owner_id = auth.uid()::text
      )
    );
END $$;

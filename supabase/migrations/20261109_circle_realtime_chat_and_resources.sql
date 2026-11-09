-- ========================================================================
-- KORSIQ REALTIME CIRCLE CHAT, DISCUSSIONS, AND RESOURCES SCHEMA
-- Migration: 20261109_circle_realtime_chat_and_resources.sql
-- ========================================================================

-- 1. CIRCLE MEMBERS TABLE (Relational Membership)
CREATE TABLE IF NOT EXISTS public.circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id TEXT NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'moderator' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON public.circle_members(circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON public.circle_members(user_id);

-- Helper function to check if a user is a member or owner of a circle (or if it's general/public)
CREATE OR REPLACE FUNCTION public.is_circle_member(p_circle_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_id = p_circle_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.study_groups
    WHERE id = p_circle_id AND (type = 'general' OR visibility = 'public' OR owner_id = p_user_id)
  );
$$;

-- 2. CIRCLE MESSAGES TABLE (Real-Time WhatsApp-Style Chat)
CREATE TABLE IF NOT EXISTS public.circle_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id TEXT NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  text TEXT NOT NULL,
  reply_to_id UUID REFERENCES public.circle_messages(id) ON DELETE SET NULL,
  reply_to_text TEXT,
  reply_to_sender TEXT,
  client_temp_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_messages_circle ON public.circle_messages(circle_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_circle_messages_sender ON public.circle_messages(sender_id);

-- 3. CIRCLE DISCUSSIONS TABLE (Questions, Topics & Threads)
CREATE TABLE IF NOT EXISTS public.circle_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id TEXT NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_discussions_circle ON public.circle_discussions(circle_id, created_at DESC);

-- 4. CIRCLE DISCUSSION REPLIES TABLE (Quoted & Threaded Replies)
CREATE TABLE IF NOT EXISTS public.circle_discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID NOT NULL REFERENCES public.circle_discussions(id) ON DELETE CASCADE,
  circle_id TEXT NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  content TEXT NOT NULL,
  quote_reply_id UUID REFERENCES public.circle_discussion_replies(id) ON DELETE SET NULL,
  quote_reply_text TEXT,
  quote_reply_author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_disc_replies_disc ON public.circle_discussion_replies(discussion_id, created_at ASC);

-- 5. ENHANCE GROUP MATERIALS FOR AI READABILITY & PROCESSING STATUS
ALTER TABLE IF EXISTS public.group_materials
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uploader_id UUID,
  ADD COLUMN IF NOT EXISTS uploader_name TEXT;

-- 6. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_materials ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES FOR CIRCLE MEMBERS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_members' AND policyname = 'Members readable by circle peers') THEN
    CREATE POLICY "Members readable by circle peers" ON public.circle_members
      FOR SELECT USING (public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_members' AND policyname = 'User can join circle') THEN
    CREATE POLICY "User can join circle" ON public.circle_members
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_members' AND policyname = 'User can leave or owner remove') THEN
    CREATE POLICY "User can leave or owner remove" ON public.circle_members
      FOR DELETE USING (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM public.study_groups WHERE id = circle_members.circle_id AND owner_id = auth.uid())
      );
  END IF;
END $$;

-- 8. RLS POLICIES FOR CIRCLE MESSAGES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_messages' AND policyname = 'Circle members can read messages') THEN
    CREATE POLICY "Circle members can read messages" ON public.circle_messages
      FOR SELECT USING (public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_messages' AND policyname = 'Circle members can send messages') THEN
    CREATE POLICY "Circle members can send messages" ON public.circle_messages
      FOR INSERT WITH CHECK (auth.uid() = sender_id AND public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_messages' AND policyname = 'Author can edit own message') THEN
    CREATE POLICY "Author can edit own message" ON public.circle_messages
      FOR UPDATE USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_messages' AND policyname = 'Author or owner can delete message') THEN
    CREATE POLICY "Author or owner can delete message" ON public.circle_messages
      FOR DELETE USING (
        auth.uid() = sender_id OR 
        EXISTS (SELECT 1 FROM public.study_groups WHERE id = circle_messages.circle_id AND owner_id = auth.uid())
      );
  END IF;
END $$;

-- 9. RLS POLICIES FOR DISCUSSIONS & REPLIES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_discussions' AND policyname = 'Members can read discussions') THEN
    CREATE POLICY "Members can read discussions" ON public.circle_discussions
      FOR SELECT USING (public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_discussions' AND policyname = 'Members can post discussions') THEN
    CREATE POLICY "Members can post discussions" ON public.circle_discussions
      FOR INSERT WITH CHECK (auth.uid() = author_id AND public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_discussions' AND policyname = 'Author or owner delete discussion') THEN
    CREATE POLICY "Author or owner delete discussion" ON public.circle_discussions
      FOR DELETE USING (
        auth.uid() = author_id OR 
        EXISTS (SELECT 1 FROM public.study_groups WHERE id = circle_discussions.circle_id AND owner_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_discussion_replies' AND policyname = 'Members can read replies') THEN
    CREATE POLICY "Members can read replies" ON public.circle_discussion_replies
      FOR SELECT USING (public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_discussion_replies' AND policyname = 'Members can submit reply') THEN
    CREATE POLICY "Members can submit reply" ON public.circle_discussion_replies
      FOR INSERT WITH CHECK (auth.uid() = author_id AND public.is_circle_member(circle_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'circle_discussion_replies' AND policyname = 'Author or owner delete reply') THEN
    CREATE POLICY "Author or owner delete reply" ON public.circle_discussion_replies
      FOR DELETE USING (
        auth.uid() = author_id OR 
        EXISTS (SELECT 1 FROM public.study_groups WHERE id = circle_discussion_replies.circle_id AND owner_id = auth.uid())
      );
  END IF;
END $$;

-- 10. RLS POLICIES FOR GROUP MATERIALS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_materials' AND policyname = 'Members can read materials') THEN
    CREATE POLICY "Members can read materials" ON public.group_materials
      FOR SELECT USING (public.is_circle_member(group_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_materials' AND policyname = 'Members can upload materials') THEN
    CREATE POLICY "Members can upload materials" ON public.group_materials
      FOR INSERT WITH CHECK (public.is_circle_member(group_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_materials' AND policyname = 'Uploader or owner can delete material') THEN
    CREATE POLICY "Uploader or owner can delete material" ON public.group_materials
      FOR DELETE USING (
        auth.uid() = uploader_id OR 
        EXISTS (SELECT 1 FROM public.study_groups WHERE id = group_materials.group_id AND owner_id = auth.uid())
      );
  END IF;
END $$;

-- 11. ENABLE REALTIME PUBLICATION
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_messages;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_discussions;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_discussion_replies;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_materials;
EXCEPTION WHEN others THEN NULL; END $$;

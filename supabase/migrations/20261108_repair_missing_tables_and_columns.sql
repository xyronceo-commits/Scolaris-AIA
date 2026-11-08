-- ========================================================================
-- KORSIQ INFRASTRUCTURE SCHEMA REPAIR (IDEMPOTENT CONSOLIDATED MIGRATION)
-- Safe to execute in the Supabase Dashboard SQL Editor
-- ========================================================================

-- 1. ACADEMIC TASKS TABLE
CREATE TABLE IF NOT EXISTS public.academic_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'assignment',
  due_date DATE NOT NULL,
  due_time TIME,
  priority TEXT NOT NULL DEFAULT 'medium',
  reminder TEXT NOT NULL DEFAULT 'none',
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  course_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_tasks_user ON public.academic_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_tasks_due ON public.academic_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_academic_tasks_completed ON public.academic_tasks(user_id, completed);

ALTER TABLE public.academic_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_tasks' AND policyname = 'Users can read own tasks') THEN
    CREATE POLICY "Users can read own tasks" ON public.academic_tasks FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_tasks' AND policyname = 'Users can insert own tasks') THEN
    CREATE POLICY "Users can insert own tasks" ON public.academic_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_tasks' AND policyname = 'Users can update own tasks') THEN
    CREATE POLICY "Users can update own tasks" ON public.academic_tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_tasks' AND policyname = 'Users can delete own tasks') THEN
    CREATE POLICY "Users can delete own tasks" ON public.academic_tasks FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. USER NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'session',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON public.user_notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created ON public.user_notifications(created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can read own notifications') THEN
    CREATE POLICY "Users can read own notifications" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can insert own notifications') THEN
    CREATE POLICY "Users can insert own notifications" ON public.user_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can update own notifications') THEN
    CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notifications' AND policyname = 'Users can delete own notifications') THEN
    CREATE POLICY "Users can delete own notifications" ON public.user_notifications FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. CIRCLES: ADD invite_code_active COLUMN TO study_groups
ALTER TABLE IF EXISTS public.study_groups
  ADD COLUMN IF NOT EXISTS invite_code_active BOOLEAN DEFAULT TRUE;

-- 4. ADMIN OTPs TABLE
CREATE TABLE IF NOT EXISTS public.admin_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_otps_email ON public.admin_otps(email);
CREATE INDEX IF NOT EXISTS idx_admin_otps_lookup ON public.admin_otps(email, used, expires_at);

ALTER TABLE public.admin_otps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_otps' AND policyname = 'Service role only admin otps') THEN
    CREATE POLICY "Service role only admin otps" ON public.admin_otps FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- Migration: Semester Outlines, Adaptive Reading Schedules, and CGPA Targets
-- Timestamp: 2026-11-12
-- ============================================================================

-- 1. Semesters
CREATE TABLE IF NOT EXISTS public.semesters (
  id TEXT PRIMARY KEY DEFAULT ('sem_' || gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  academic_year TEXT DEFAULT '2025/2026',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  exam_start_date DATE,
  study_days INT[] DEFAULT ARRAY[1, 2, 3, 4, 5], -- Monday to Friday default
  hours_per_day NUMERIC(3, 1) DEFAULT 3.0,
  preferred_time TEXT DEFAULT 'evening', -- morning, afternoon, evening, night
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Course Outlines
CREATE TABLE IF NOT EXISTS public.course_outlines (
  id TEXT PRIMARY KEY DEFAULT ('outline_' || gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semester_id TEXT REFERENCES public.semesters(id) ON DELETE CASCADE,
  course_id TEXT,
  course_code TEXT NOT NULL,
  course_title TEXT,
  units INT DEFAULT 3,
  difficulty_rating INT DEFAULT 3 CHECK (difficulty_rating BETWEEN 1 AND 5),
  raw_file_path TEXT,
  extracted_text TEXT,
  parsed_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'reviewed', 'error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Outline Topics
CREATE TABLE IF NOT EXISTS public.outline_topics (
  id TEXT PRIMARY KEY DEFAULT ('topic_' || gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outline_id TEXT NOT NULL REFERENCES public.course_outlines(id) ON DELETE CASCADE,
  week_number INT DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  learning_objectives JSONB DEFAULT '[]'::jsonb,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Course Assessments (CA and Exams)
CREATE TABLE IF NOT EXISTS public.assessments (
  id TEXT PRIMARY KEY DEFAULT ('assess_' || gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outline_id TEXT REFERENCES public.course_outlines(id) ON DELETE CASCADE,
  course_id TEXT,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'test' CHECK (type IN ('test', 'quiz', 'assignment', 'midterm', 'exam', 'practical', 'project')),
  weight_percent NUMERIC(5, 2) DEFAULT 20.0,
  score_obtained NUMERIC(5, 2),
  max_score NUMERIC(5, 2) DEFAULT 100.0,
  due_date DATE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Study Plan Items (Adaptive Reading Schedule)
CREATE TABLE IF NOT EXISTS public.study_plan_items (
  id TEXT PRIMARY KEY DEFAULT ('plan_' || gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semester_id TEXT REFERENCES public.semesters(id) ON DELETE CASCADE,
  course_id TEXT,
  course_code TEXT NOT NULL,
  topic_id TEXT REFERENCES public.outline_topics(id) ON DELETE SET NULL,
  topic_title TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  start_time TIME,
  duration_minutes INT DEFAULT 45,
  item_type TEXT DEFAULT 'read-ahead' CHECK (item_type IN ('read-ahead', 'review', 'practice', 'revision')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'rescheduled')),
  original_date DATE,
  reschedule_reason TEXT,
  synced_task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. CGPA Targets & Scenarios
CREATE TABLE IF NOT EXISTS public.cgpa_targets (
  id TEXT PRIMARY KEY DEFAULT ('target_' || gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semester_id TEXT REFERENCES public.semesters(id) ON DELETE SET NULL,
  current_cgpa NUMERIC(4, 2) NOT NULL,
  credits_earned INT NOT NULL,
  target_cgpa NUMERIC(4, 2) NOT NULL,
  semester_units INT NOT NULL,
  required_semester_gpa NUMERIC(4, 2) NOT NULL,
  is_reachable BOOLEAN NOT NULL DEFAULT TRUE,
  max_reachable_cgpa NUMERIC(4, 2) NOT NULL,
  grading_scale JSONB NOT NULL DEFAULT '{"A": {"min": 70, "max": 100, "points": 5}, "B": {"min": 60, "max": 69, "points": 4}, "C": {"min": 50, "max": 59, "points": 3}, "D": {"min": 45, "max": 49, "points": 2}, "E": {"min": 40, "max": 44, "points": 1}, "F": {"min": 0, "max": 39, "points": 0}}'::jsonb,
  scenarios JSONB DEFAULT '{}'::jsonb, -- Safe, Balanced, Stretch
  course_targets JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Row Level Security (RLS) - Users access only their own rows
-- ============================================================================

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_outlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outline_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cgpa_targets ENABLE ROW LEVEL SECURITY;

-- Semesters Policies
CREATE POLICY "Users can manage their own semesters" ON public.semesters
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Course Outlines Policies
CREATE POLICY "Users can manage their own course outlines" ON public.course_outlines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Outline Topics Policies
CREATE POLICY "Users can manage their own outline topics" ON public.outline_topics
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Assessments Policies
CREATE POLICY "Users can manage their own assessments" ON public.assessments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Study Plan Items Policies
CREATE POLICY "Users can manage their own study plan items" ON public.study_plan_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- CGPA Targets Policies
CREATE POLICY "Users can manage their own cgpa targets" ON public.cgpa_targets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for fast user queries
CREATE INDEX IF NOT EXISTS idx_semesters_user ON public.semesters(user_id);
CREATE INDEX IF NOT EXISTS idx_course_outlines_user ON public.course_outlines(user_id);
CREATE INDEX IF NOT EXISTS idx_outline_topics_outline ON public.outline_topics(outline_id);
CREATE INDEX IF NOT EXISTS idx_assessments_user ON public.assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_user_date ON public.study_plan_items(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cgpa_targets_user ON public.cgpa_targets(user_id);

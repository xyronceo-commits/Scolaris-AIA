-- Small additive migration for course topics and continuous assessment
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS topics JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ca_score NUMERIC,
  ADD COLUMN IF NOT EXISTS exam_weight INT DEFAULT 70;

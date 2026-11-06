-- ==============================================================================
-- Scolaris AI: Onboarding Profile Fields Migration
-- Safe & idempotent migration to add extended student profile fields to public.profiles
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS major text,
  ADD COLUMN IF NOT EXISTS academic_goals text,
  ADD COLUMN IF NOT EXISTS study_style text,
  ADD COLUMN IF NOT EXISTS assistance_areas text[];

-- Ensure RLS allows authenticated users to read and update their own profile records
-- (Existing RLS policies remain in effect; users can only modify their own row)
COMMENT ON COLUMN public.profiles.department IS 'Student department or faculty';
COMMENT ON COLUMN public.profiles.major IS 'Degree or course of study';
COMMENT ON COLUMN public.profiles.academic_goals IS 'Primary academic goals selected during onboarding';
COMMENT ON COLUMN public.profiles.study_style IS 'Preferred study style selected during onboarding';
COMMENT ON COLUMN public.profiles.assistance_areas IS 'Areas where student requested academic assistance';

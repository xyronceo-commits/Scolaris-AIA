-- ========================================================================
-- KORSIQ DATABASE CLEAN SLATE SCRIPT
-- File: supabase/migrations/clean_demo_rows.sql
-- PURPOSE: Safely purges any seeded development or mock rows from tables.
-- INSTRUCTIONS: Run this script manually in your Supabase SQL Editor.
--               It is wrapped in a reviewable transaction block.
-- ========================================================================

BEGIN;

-- 1. Identify and delete mock tasks (created during testing with dummy titles)
DELETE FROM public.tasks
WHERE title ILIKE '%demo%'
   OR title ILIKE '%sample%'
   OR title ILIKE '%mock%'
   OR description ILIKE '%sample task%'
   OR description ILIKE '%demo task%';

-- 2. Identify and delete mock course records
DELETE FROM public.courses
WHERE code IN ('CS203', 'BIO180', 'EC102', 'CS101', 'MATH210', 'WEB101')
  AND (title ILIKE '%sample%' OR title ILIKE '%advanced algorithms%' OR title ILIKE '%core biostatistics%' OR title ILIKE '%microeconomics%')
  AND user_id NOT IN (
    -- Protect real active accounts if any real user manually registered these codes
    SELECT id FROM auth.users WHERE email NOT ILIKE '%test%' AND email NOT ILIKE '%demo%' AND email NOT ILIKE '%example.com'
  );

-- 3. Identify and delete mock study sessions
DELETE FROM public.study_sessions
WHERE id LIKE 'session-mock-%'
   OR mode = 'Mock Mode';

-- 4. Clean up mock study circles / groups seeded during development
DELETE FROM public.study_groups
WHERE name ILIKE '%demo circle%'
   OR name ILIKE '%mock group%'
   OR name ILIKE '%sample group%'
   OR id LIKE 'demo_%'
   OR id LIKE 'mock_%';

-- 5. Clean up any orphaned mock circle messages
DELETE FROM public.circle_messages
WHERE text ILIKE '%sample message%'
   OR text ILIKE '%test message%'
   OR client_temp_id LIKE 'mock_%';

-- 6. Clean up mock test profiles with fake/throwaway domains
DELETE FROM public.profiles
WHERE email ILIKE '%@example.com'
   OR email ILIKE 'test%@korsiq.com'
   OR email ILIKE 'demo%@korsiq.com';

COMMIT;

-- VERIFICATION QUERY: Check that tables contain only legitimate student data
-- SELECT 'profiles' AS tbl, count(*) FROM public.profiles
-- UNION ALL SELECT 'courses', count(*) FROM public.courses
-- UNION ALL SELECT 'tasks', count(*) FROM public.tasks
-- UNION ALL SELECT 'study_groups', count(*) FROM public.study_groups;

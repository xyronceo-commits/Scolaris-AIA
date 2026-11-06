-- Migration: Add invite_code_active to study_groups table
-- Idempotent script for Supabase SQL Editor

ALTER TABLE IF EXISTS public.study_groups
  ADD COLUMN IF NOT EXISTS invite_code_active BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.study_groups.invite_code_active IS 'Indicates whether the invitation code for the circle is active or revoked';

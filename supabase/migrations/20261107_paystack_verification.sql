-- ==============================================================================
-- KorsIQ: Post-Migration SQL Verification Script
-- Run this script in the Supabase SQL Editor AFTER executing
-- 20261107_paystack_security_remediation.sql to verify database state.
-- ==============================================================================

-- 1. VERIFY REQUIRED COLUMNS & DATA TYPES ON subscriptions
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'subscriptions'
ORDER BY ordinal_position;

-- 2. VERIFY REQUIRED COLUMNS & DATA TYPES ON payment_transactions
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'payment_transactions'
ORDER BY ordinal_position;

-- 3. VERIFY REQUIRED COLUMNS & DATA TYPES ON webhook_events
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'webhook_events'
ORDER BY ordinal_position;

-- 4. VERIFY SUBSCRIPTION COLUMNS & DEFAULTS ON profiles
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name IN ('tier', 'is_pro', 'subscription_tier', 'subscription_status', 'payment_status', 'subscription_end', 'paystack_customer_code')
ORDER BY column_name;

-- 5. VERIFY FOREIGN KEYS ON subscriptions & payment_transactions
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('subscriptions', 'payment_transactions');

-- 6. VERIFY CHECK CONSTRAINTS
SELECT 
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS check_clause
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND c.contype = 'c'
  AND conrelid::regclass::text IN ('subscriptions', 'payment_transactions', 'webhook_events')
ORDER BY table_name, constraint_name;

-- 7. VERIFY RLS STATUS ON ALL THREE TABLES
SELECT 
  schemaname, 
  tablename, 
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events');

-- 8. VERIFY ACTIVE RLS POLICIES
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events')
ORDER BY tablename, policyname;

-- 9. VERIFY PROFILES TRIGGERS (Confirm profiles_protect is gone, protect_profile_subscription is installed)
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles'
ORDER BY trigger_name;

-- 10. VERIFY INDEXES AND UNIQUE CONSTRAINTS
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events')
ORDER BY tablename, indexname;

-- 11. VERIFY PROFILE TIER DISTRIBUTION (Audit unverified accounts)
SELECT 
  tier, 
  is_pro, 
  subscription_tier, 
  subscription_status, 
  COUNT(*) AS profile_count
FROM public.profiles
GROUP BY tier, is_pro, subscription_tier, subscription_status
ORDER BY profile_count DESC;

-- ==============================================================================
-- KorsIQ: Comprehensive Post-Migration SQL Verification & Diagnostic Audit
-- Run this script in the Supabase SQL Editor AFTER executing
-- 20261107_paystack_security_remediation.sql to verify database state.
-- Includes structural verification, permission audits, and diagnostic queries
-- returning actual problematic records.
-- ==============================================================================

-- ==============================================================================
-- PART 1: STRUCTURAL & CONSTRAINT AUDITS
-- ==============================================================================

-- 1. VERIFY PRIMARY KEYS ON ALL THREE TABLES
SELECT 
  tc.table_name,
  tc.constraint_name AS primary_key_constraint,
  kcu.column_name AS pk_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' 
  AND tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_name IN ('subscriptions', 'payment_transactions', 'webhook_events')
ORDER BY tc.table_name;

-- 2. VERIFY REQUIRED COLUMNS, NULLABILITY & DEFAULTS
SELECT 
  table_name,
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('subscriptions', 'payment_transactions', 'webhook_events')
ORDER BY table_name, ordinal_position;

-- 3. VERIFY FOREIGN KEY DEFINITIONS (Verifies relation to auth.users.id)
SELECT
  conrel.relname AS table_name,
  conatt.attname AS column_name,
  confns.nspname AS foreign_table_schema,
  confrel.relname AS foreign_table_name,
  confatt.attname AS foreign_column_name,
  c.conname AS constraint_name,
  CASE c.confdeltype
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'a' THEN 'NO ACTION'
    ELSE c.confdeltype::text
  END AS delete_rule
FROM pg_constraint c
JOIN pg_class conrel ON c.conrelid = conrel.oid
JOIN pg_namespace conns ON conrel.relnamespace = conns.oid
JOIN pg_class confrel ON c.confrelid = confrel.oid
JOIN pg_namespace confns ON confrel.relnamespace = confns.oid
JOIN pg_attribute conatt ON conatt.attrelid = conrel.oid AND conatt.attnum = ANY(c.conkey)
JOIN pg_attribute confatt ON confatt.attrelid = confrel.oid AND confatt.attnum = ANY(c.confkey)
WHERE c.contype = 'f'
  AND conns.nspname = 'public'
  AND conrel.relname IN ('subscriptions', 'payment_transactions');

-- 4. VERIFY CHECK CONSTRAINTS
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

-- 5. VERIFY UNIQUE INDEXES
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events')
  AND (indexdef LIKE '%UNIQUE%' OR indexname LIKE '%unique%')
ORDER BY tablename, indexname;

-- 6. VERIFY RLS STATUS & POLICIES
SELECT 
  schemaname, 
  tablename, 
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events');

SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events')
ORDER BY tablename, policyname;

-- 7. VERIFY ACTUAL TABLE PRIVILEGES (Confirm anon and authenticated lack INSERT/UPDATE/DELETE)
SELECT 
  table_name, 
  grantee, 
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('subscriptions', 'payment_transactions', 'webhook_events')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 8. VERIFY PROFILE PROTECTION TRIGGER
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

-- ==============================================================================
-- PART 2: DIAGNOSTIC AUDITS (RETURNING ACTUAL PROBLEMATIC RECORDS)
-- Every query below should return 0 rows in a healthy, remediated database.
-- ==============================================================================

-- AUDIT 1: Profiles claiming Pro/Paid without valid unexpired subscription
-- (Expectation: 0 rows)
SELECT 
  p.id AS profile_id,
  p.email,
  p.tier,
  p.is_pro,
  to_jsonb(p)->>'subscription_tier' AS subscription_tier,
  to_jsonb(p)->>'subscription_status' AS subscription_status,
  to_jsonb(p)->>'payment_status' AS payment_status,
  to_jsonb(p)->>'subscription_end' AS subscription_end,
  'Unverified or expired profile with paid/pro privileges' AS diagnostic_issue
FROM public.profiles p
WHERE (p.tier IN ('scholar', 'sage', 'plus', 'studio') OR p.is_pro = true)
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p.id 
      AND (
        (s.payment_provider = 'manual_admin' AND s.status = 'manual_active' AND s.payment_status = 'paid' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR
        (s.payment_provider = 'paystack' AND s.status = 'active' AND s.payment_status = 'paid' AND s.amount_paid > 0 AND s.payment_reference IS NOT NULL AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
      )
  );

-- AUDIT 2: Free subscriptions retaining 'paid' payment status
-- (Expectation: 0 rows)
SELECT 
  s.id AS subscription_id,
  s.user_id,
  s.plan_tier,
  s.payment_status,
  s.status,
  'Free subscription cannot retain paid status' AS diagnostic_issue
FROM public.subscriptions s
WHERE s.plan_tier = 'free' AND s.payment_status = 'paid';

-- AUDIT 3: Subscriptions claiming paid status without payment evidence
-- (Expectation: 0 rows)
SELECT 
  s.id AS subscription_id,
  s.user_id,
  s.plan_tier,
  s.payment_provider,
  s.payment_status,
  s.amount_paid,
  s.payment_reference,
  s.status,
  'Paid status lacks payment evidence or valid reference' AS diagnostic_issue
FROM public.subscriptions s
WHERE s.payment_status = 'paid'
  AND s.payment_provider <> 'manual_admin'
  AND (s.amount_paid <= 0 OR s.payment_reference IS NULL OR trim(s.payment_reference) = '');

-- AUDIT 4: Subscriptions marked 'active' past their expiration date
-- (Expectation: 0 rows)
SELECT 
  s.id AS subscription_id,
  s.user_id,
  s.plan_tier,
  s.payment_provider,
  s.status,
  s.current_period_end,
  now() AS current_time,
  'Subscription is active past expiration date' AS diagnostic_issue
FROM public.subscriptions s
WHERE s.status = 'active'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end <= now();

-- AUDIT 5: Paystack premium subscriptions with NULL expiration (Indefinite access leak)
-- (Expectation: 0 rows)
SELECT 
  s.id AS subscription_id,
  s.user_id,
  s.plan_tier,
  s.payment_provider,
  s.current_period_start,
  s.current_period_end,
  'Paystack premium subscription has NULL current_period_end' AS diagnostic_issue
FROM public.subscriptions s
WHERE s.payment_provider = 'paystack'
  AND s.plan_tier IN ('plus', 'studio', 'scholar', 'sage')
  AND s.current_period_end IS NULL;

-- AUDIT 6: Payment transactions with financial amount inconsistencies
-- (Expectation: 0 rows)
SELECT 
  pt.id AS transaction_id,
  pt.reference,
  pt.amount_kobo,
  pt.amount_naira,
  (pt.amount_naira * 100) AS expected_amount_kobo,
  'Amount kobo does not equal amount naira * 100' AS diagnostic_issue
FROM public.payment_transactions pt
WHERE pt.amount_kobo IS NOT NULL 
  AND pt.amount_naira IS NOT NULL
  AND pt.amount_kobo <> (pt.amount_naira * 100);

-- AUDIT 7: Duplicate payment references
-- (Expectation: 0 rows)
SELECT 
  payment_reference, 
  COUNT(*) AS occurrences,
  'Duplicate payment_reference in subscriptions' AS diagnostic_issue
FROM public.subscriptions
WHERE payment_reference IS NOT NULL AND trim(payment_reference) <> ''
GROUP BY payment_reference
HAVING COUNT(*) > 1;

SELECT 
  reference, 
  COUNT(*) AS occurrences,
  'Duplicate reference in payment_transactions' AS diagnostic_issue
FROM public.payment_transactions
WHERE reference IS NOT NULL AND trim(reference) <> ''
GROUP BY reference
HAVING COUNT(*) > 1;

-- AUDIT 8: Orphaned user IDs
-- (Expectation: 0 rows)
SELECT 
  s.id AS subscription_id,
  s.user_id,
  'Orphaned subscription references non-existent auth.users' AS diagnostic_issue
FROM public.subscriptions s
WHERE s.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id);

SELECT 
  pt.id AS transaction_id,
  pt.user_id,
  'Orphaned payment_transaction references non-existent auth.users' AS diagnostic_issue
FROM public.payment_transactions pt
WHERE pt.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = pt.user_id);

-- AUDIT 9: Webhook events marked processed without timestamp or invalid status
-- (Expectation: 0 rows)
SELECT 
  we.id AS event_id,
  we.event_type,
  we.status,
  we.processed_at,
  'Processed webhook event missing processed_at timestamp' AS diagnostic_issue
FROM public.webhook_events we
WHERE we.status = 'processed' AND we.processed_at IS NULL;

-- AUDIT 10: Profile vs Subscription Synchronization Gaps
-- (Expectation: 0 rows)
SELECT 
  p.id AS profile_id,
  p.email,
  p.tier AS profile_tier,
  p.is_pro AS profile_is_pro,
  s.plan_tier AS active_subscription_tier,
  s.status AS subscription_status,
  'Profile desynchronized from latest verified active subscription' AS diagnostic_issue
FROM public.profiles p
JOIN (
  SELECT DISTINCT ON (user_id) 
    user_id, plan_tier, status
  FROM public.subscriptions
  WHERE payment_status = 'paid'
    AND status IN ('active', 'manual_active')
    AND (current_period_end IS NULL OR current_period_end > now())
  ORDER BY user_id, current_period_start DESC
) s ON p.id = s.user_id
WHERE p.tier <> s.plan_tier OR p.is_pro <> true;

-- ==============================================================================
-- PART 3: SUMMARY PROFILE DISTRIBUTION
-- ==============================================================================
SELECT 
  p.tier, 
  p.is_pro, 
  to_jsonb(p)->>'subscription_tier' AS subscription_tier, 
  to_jsonb(p)->>'subscription_status' AS subscription_status, 
  to_jsonb(p)->>'payment_status' AS payment_status,
  COUNT(*) AS profile_count
FROM public.profiles p
GROUP BY p.tier, p.is_pro, to_jsonb(p)->>'subscription_tier', to_jsonb(p)->>'subscription_status', to_jsonb(p)->>'payment_status'
ORDER BY profile_count DESC;

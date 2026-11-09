-- ==============================================================================
-- KorsIQ Migration: Complete Paystack Security & Subscription Remediation (Final)
-- Transaction-safe, idempotent, strictly verified, and backward/forward compatible.
-- 
-- Order of Execution:
--   1. Schema Reconciliation & Primary Key Enforcement on public.subscriptions
--   2. Data Integrity Pre-Checks on subscriptions (Orphaned user_id & Duplicate references)
--   3. Foreign Key Definition Verification & Installation on subscriptions
--   4. Constraint Sanitization & Re-ordering on subscriptions (Drop -> Normalize -> Add)
--   5. Expiration Enforcement & NULL-Expiration Safeguards for Paystack Subscriptions
--   6. Schema Reconciliation, Primary Key & Pre-Checks for public.payment_transactions
--   7. Financial Consistency Verification & Constraint Ordering on payment_transactions
--   8. Schema Reconciliation, Primary Key & Webhook Event Lifecycle on public.webhook_events
--   9. Full RLS Policy Audit & Table Privilege Hardening (Revoke unsafe grants)
--  10. Dependency-Safe Legacy Trigger & Function Cleanup (No unexamined CASCADE)
--  11. Profiles Defaults, Columns & Null Value Normalization
--  12. Subscription Reconciliation: Synchronize Valid Subscriptions & Demote Unverified/Expired Profiles
--  13. Consolidated Profile Protection Trigger
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. Schema Reconciliation & Primary Key Enforcement on public.subscriptions
-- ==============================================================================

-- If legacy 'plan' column exists instead of 'plan_tier', rename it safely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan_tier'
  ) THEN
    ALTER TABLE public.subscriptions RENAME COLUMN plan TO plan_tier;
  END IF;
END $$;

-- Create table if it does not exist with safe, non-fabricated defaults
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'inactive',
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'none',
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  paystack_subscription_code TEXT,
  paystack_customer_code TEXT,
  paystack_plan_code TEXT,
  paystack_authorization_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconcile EVERY required column to ensure pre-existing tables have all columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_authorization_code TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure defaults are strictly non-fabricated
ALTER TABLE public.subscriptions
  ALTER COLUMN payment_status SET DEFAULT 'none',
  ALTER COLUMN status SET DEFAULT 'inactive',
  ALTER COLUMN plan_tier SET DEFAULT 'free',
  ALTER COLUMN amount_paid SET DEFAULT 0;

-- Enforce primary key on public.subscriptions if missing on pre-existing table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class conrel ON c.conrelid = conrel.oid
    JOIN pg_namespace conns ON conrel.relnamespace = conns.oid
    WHERE conns.nspname = 'public' 
      AND conrel.relname = 'subscriptions' 
      AND c.contype = 'p'
  ) THEN
    UPDATE public.subscriptions SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.subscriptions ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.subscriptions ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ==============================================================================
-- 2. Data Integrity Pre-Checks on public.subscriptions
-- ==============================================================================

DO $$
DECLARE
  v_null_user_count INTEGER;
  v_orphan_count INTEGER;
  v_dup_ref RECORD;
BEGIN
  -- 2.1 Check for null user_id
  SELECT COUNT(*) INTO v_null_user_count
  FROM public.subscriptions
  WHERE user_id IS NULL;

  IF v_null_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot reconcile public.subscriptions: found % records with NULL user_id. Manual inspection required before applying NOT NULL constraint.', v_null_user_count;
  END IF;

  -- 2.2 Check for orphaned user_id (referencing non-existent auth.users)
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.subscriptions s
  WHERE s.user_id IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id);

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot reconcile public.subscriptions: found % orphaned subscription records referencing non-existent auth.users. Manual resolution required before applying foreign key.', v_orphan_count;
  END IF;

  -- 2.3 Check for duplicate non-null payment_reference
  FOR v_dup_ref IN
    SELECT payment_reference, COUNT(*) AS cnt
    FROM public.subscriptions
    WHERE payment_reference IS NOT NULL AND trim(payment_reference) <> ''
    GROUP BY payment_reference
    HAVING COUNT(*) > 1
  LOOP
    RAISE EXCEPTION 'Cannot reconcile public.subscriptions: found duplicate payment_reference "%" (% occurrences). Manual resolution required before creating unique index.', v_dup_ref.payment_reference, v_dup_ref.cnt;
  END LOOP;
END $$;

-- ==============================================================================
-- 3. Foreign Key Definition Verification & Installation on subscriptions
-- ==============================================================================

DO $$
DECLARE
  v_fk_exists BOOLEAN;
BEGIN
  -- Verify by actual foreign key column relationship
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class conrel ON c.conrelid = conrel.oid
    JOIN pg_namespace conns ON conrel.relnamespace = conns.oid
    JOIN pg_class confrel ON c.confrelid = confrel.oid
    JOIN pg_namespace confns ON confrel.relnamespace = confns.oid
    JOIN pg_attribute conatt ON conatt.attrelid = conrel.oid AND conatt.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND conns.nspname = 'public'
      AND conrel.relname = 'subscriptions'
      AND confns.nspname = 'auth'
      AND confrel.relname = 'users'
      AND conatt.attname = 'user_id'
  ) INTO v_fk_exists;

  IF NOT v_fk_exists THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ==============================================================================
-- 4. Constraint Sanitization & Re-ordering on subscriptions
-- Always: DROP legacy constraints FIRST, then normalize data, then ADD constraints.
-- ==============================================================================

-- (a) plan_tier
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

UPDATE public.subscriptions
SET plan_tier = 'free'
WHERE plan_tier IS NULL 
   OR plan_tier NOT IN ('free', 'plus', 'studio', 'scholar', 'sage');

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier IN ('free', 'plus', 'studio', 'scholar', 'sage'));

-- (b) billing_cycle
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;

UPDATE public.subscriptions
SET billing_cycle = 'monthly'
WHERE billing_cycle IS NULL 
   OR billing_cycle NOT IN ('monthly', 'annual');

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check
  CHECK (billing_cycle IN ('monthly', 'annual'));

-- (c) payment_status: Evaluates ALL records; free subscriptions NEVER retain paid status
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_status_check;

-- Rule: Free subscriptions must NEVER retain paid status
UPDATE public.subscriptions
SET payment_status = 'none'
WHERE plan_tier = 'free';

-- Rule: Paid records only retain 'paid' status when supported by trusted evidence:
-- Case 1: Legitimate manual admin override
-- Case 2: Gateway payment with actual amount > 0, non-empty reference, and active status
UPDATE public.subscriptions
SET payment_status = CASE
  WHEN payment_status = 'paid' AND payment_provider = 'manual_admin' AND status = 'manual_active' THEN 'paid'
  WHEN payment_status = 'paid' AND amount_paid > 0 AND payment_reference IS NOT NULL AND trim(payment_reference) <> '' THEN 'paid'
  WHEN payment_status IN ('pending', 'failed', 'abandoned', 'cancelled', 'refunded', 'none') THEN payment_status
  ELSE 'none'
END
WHERE plan_tier IN ('plus', 'studio', 'scholar', 'sage');

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_payment_status_check
  CHECK (payment_status IN ('paid', 'pending', 'failed', 'abandoned', 'cancelled', 'refunded', 'none'));

-- (d) status: Reconcile active vs expired vs inactive safely
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- Unverified subscriptions (payment_status <> 'paid' and not free) must not remain active
UPDATE public.subscriptions
SET status = 'inactive'
WHERE plan_tier IN ('plus', 'studio', 'scholar', 'sage')
  AND payment_status <> 'paid'
  AND status = 'active';

UPDATE public.subscriptions
SET status = 'inactive'
WHERE status IS NULL 
   OR status NOT IN ('active', 'pending', 'cancelled', 'expired', 'failed', 'past_due', 'manual_active', 'inactive');

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'pending', 'cancelled', 'expired', 'failed', 'past_due', 'manual_active', 'inactive'));

-- (e) payment_provider
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_provider_check;

UPDATE public.subscriptions
SET payment_provider = 'paystack'
WHERE payment_provider IS NULL 
   OR payment_provider NOT IN ('paystack', 'manual_admin', 'test');

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_payment_provider_check
  CHECK (payment_provider IN ('paystack', 'manual_admin', 'test'));

-- ==============================================================================
-- 5. Expiration Enforcement & NULL-Expiration Safeguards for Paystack Subscriptions
-- ==============================================================================

-- 5.1 Prevent NULL expiration dates from unintentionally granting indefinite Paystack premium access.
-- If a Paystack paid subscription has NULL current_period_end, compute 30 days from current_period_start.
UPDATE public.subscriptions
SET current_period_end = current_period_start + INTERVAL '30 days'
WHERE payment_provider = 'paystack'
  AND plan_tier IN ('plus', 'studio', 'scholar', 'sage')
  AND current_period_end IS NULL
  AND current_period_start IS NOT NULL;

-- If both start and end are missing on a paid gateway subscription, it cannot grant access.
UPDATE public.subscriptions
SET current_period_end = now() - INTERVAL '1 second',
    status = 'expired'
WHERE payment_provider = 'paystack'
  AND plan_tier IN ('plus', 'studio', 'scholar', 'sage')
  AND current_period_end IS NULL;

-- 5.2 Expire subscriptions where current_period_end is in the past
UPDATE public.subscriptions
SET status = 'expired'
WHERE status IN ('active', 'manual_active')
  AND current_period_end IS NOT NULL
  AND current_period_end <= now();

-- Normalize remaining mandatory fields before applying NOT NULL
UPDATE public.subscriptions SET amount_paid = 0 WHERE amount_paid IS NULL;
UPDATE public.subscriptions SET currency = 'NGN' WHERE currency IS NULL;
UPDATE public.subscriptions SET current_period_start = COALESCE(created_at, now()) WHERE current_period_start IS NULL;
UPDATE public.subscriptions SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE public.subscriptions SET created_at = now() WHERE created_at IS NULL;
UPDATE public.subscriptions SET updated_at = now() WHERE updated_at IS NULL;

-- Enforce NOT NULL on essential subscription columns
ALTER TABLE public.subscriptions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN plan_tier SET NOT NULL,
  ALTER COLUMN billing_cycle SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN payment_provider SET NOT NULL,
  ALTER COLUMN payment_status SET NOT NULL,
  ALTER COLUMN amount_paid SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN current_period_start SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Performance indexes and unique reference constraint
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment_reference_unique 
  ON public.subscriptions(payment_reference) 
  WHERE payment_reference IS NOT NULL AND trim(payment_reference) <> '';
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ==============================================================================
-- 6. Schema Reconciliation, Primary Key & Pre-Checks for public.payment_transactions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  paystack_reference TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'plus',
  amount_kobo NUMERIC NOT NULL,
  amount_naira NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending',
  channel TEXT DEFAULT 'card',
  customer_email TEXT NOT NULL,
  paystack_plan_code TEXT,
  authorization_url TEXT,
  access_code TEXT,
  paid_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  gateway_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconcile all columns if payment_transactions already existed
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS paystack_reference TEXT,
  ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'plus',
  ADD COLUMN IF NOT EXISTS amount_kobo NUMERIC,
  ADD COLUMN IF NOT EXISTS amount_naira NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS paystack_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS authorization_url TEXT,
  ADD COLUMN IF NOT EXISTS access_code TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gateway_response TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Enforce primary key on payment_transactions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class conrel ON c.conrelid = conrel.oid
    JOIN pg_namespace conns ON conrel.relnamespace = conns.oid
    WHERE conns.nspname = 'public' 
      AND conrel.relname = 'payment_transactions' 
      AND c.contype = 'p'
  ) THEN
    UPDATE public.payment_transactions SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.payment_transactions ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.payment_transactions ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 6.1 Pre-checks on public.payment_transactions
DO $$
DECLARE
  v_null_user_count INTEGER;
  v_orphan_count INTEGER;
  v_null_ref_count INTEGER;
  v_dup_ref RECORD;
BEGIN
  SELECT COUNT(*) INTO v_null_user_count
  FROM public.payment_transactions
  WHERE user_id IS NULL;

  IF v_null_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot reconcile public.payment_transactions: found % records with NULL user_id. Manual resolution required before applying NOT NULL constraint.', v_null_user_count;
  END IF;

  SELECT COUNT(*) INTO v_orphan_count
  FROM public.payment_transactions pt
  WHERE pt.user_id IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = pt.user_id);

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot reconcile public.payment_transactions: found % orphaned records referencing non-existent auth.users. Manual resolution required before applying foreign key.', v_orphan_count;
  END IF;

  SELECT COUNT(*) INTO v_null_ref_count
  FROM public.payment_transactions
  WHERE reference IS NULL OR trim(reference) = '';

  IF v_null_ref_count > 0 THEN
    RAISE EXCEPTION 'Cannot reconcile public.payment_transactions: found % records with NULL or empty reference. Cannot fabricate transaction references. Manual resolution required.', v_null_ref_count;
  END IF;

  FOR v_dup_ref IN
    SELECT reference, COUNT(*) AS cnt
    FROM public.payment_transactions
    WHERE reference IS NOT NULL AND trim(reference) <> ''
    GROUP BY reference
    HAVING COUNT(*) > 1
  LOOP
    RAISE EXCEPTION 'Cannot reconcile public.payment_transactions: found duplicate reference "%" (% occurrences). Manual resolution required before creating unique index.', v_dup_ref.reference, v_dup_ref.cnt;
  END LOOP;
END $$;

-- Verify foreign key definition on payment_transactions
DO $$
DECLARE
  v_fk_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class conrel ON c.conrelid = conrel.oid
    JOIN pg_namespace conns ON conrel.relnamespace = conns.oid
    JOIN pg_class confrel ON c.confrelid = confrel.oid
    JOIN pg_namespace confns ON confrel.relnamespace = confns.oid
    JOIN pg_attribute conatt ON conatt.attrelid = conrel.oid AND conatt.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND conns.nspname = 'public'
      AND conrel.relname = 'payment_transactions'
      AND confns.nspname = 'auth'
      AND confrel.relname = 'users'
      AND conatt.attname = 'user_id'
  ) INTO v_fk_exists;

  IF NOT v_fk_exists THEN
    ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey;
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ==============================================================================
-- 7. Financial Consistency Verification & Constraint Ordering on payment_transactions
-- ==============================================================================

DO $$
DECLARE
  v_inconsistent RECORD;
  v_null_amount_count INTEGER;
BEGIN
  -- Safe mathematical conversion where only one column is populated
  UPDATE public.payment_transactions
  SET amount_kobo = amount_naira * 100
  WHERE amount_kobo IS NULL AND amount_naira IS NOT NULL;

  UPDATE public.payment_transactions
  SET amount_naira = amount_kobo / 100
  WHERE amount_naira IS NULL AND amount_kobo IS NOT NULL;

  -- Verify agreement where both exist: abort if amount_kobo != amount_naira * 100
  FOR v_inconsistent IN
    SELECT reference, amount_kobo, amount_naira
    FROM public.payment_transactions
    WHERE amount_kobo IS NOT NULL 
      AND amount_naira IS NOT NULL
      AND amount_kobo <> (amount_naira * 100)
  LOOP
    RAISE EXCEPTION 'Financial inconsistency in public.payment_transactions for reference "%": amount_kobo (%) does not equal amount_naira * 100 (%). Manual audit required.',
      v_inconsistent.reference, v_inconsistent.amount_kobo, (v_inconsistent.amount_naira * 100);
  END LOOP;

  -- Ensure no records remain with missing amounts (never invent financial amounts)
  SELECT COUNT(*) INTO v_null_amount_count
  FROM public.payment_transactions
  WHERE amount_kobo IS NULL OR amount_naira IS NULL;

  IF v_null_amount_count > 0 THEN
    RAISE EXCEPTION 'Cannot reconcile public.payment_transactions: found % records with missing financial amounts. Cannot fabricate amounts. Manual resolution required.', v_null_amount_count;
  END IF;
END $$;

-- Drop constraints before normalizing
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

UPDATE public.payment_transactions
SET status = 'pending'
WHERE status IS NULL 
   OR status NOT IN ('pending', 'success', 'failed', 'abandoned', 'cancelled', 'refunded', 'reversed');

ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'abandoned', 'cancelled', 'refunded', 'reversed'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_plan_tier_check;

UPDATE public.payment_transactions
SET plan_tier = 'plus'
WHERE plan_tier IS NULL 
   OR plan_tier NOT IN ('plus', 'studio');

ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_plan_tier_check
  CHECK (plan_tier IN ('plus', 'studio'));

-- Apply NOT NULL constraints on payment_transactions
ALTER TABLE public.payment_transactions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN reference SET NOT NULL,
  ALTER COLUMN plan_tier SET NOT NULL,
  ALTER COLUMN amount_kobo SET NOT NULL,
  ALTER COLUMN amount_naira SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_ref_unique ON public.payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);

-- ==============================================================================
-- 8. Schema Reconciliation, Primary Key & Webhook Event Lifecycle on public.webhook_events
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT,
  event_type TEXT NOT NULL,
  reference TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Ensure default status is 'received' and processed_at is NULL initially
ALTER TABLE public.webhook_events
  ALTER COLUMN status SET DEFAULT 'received',
  ALTER COLUMN processed_at DROP DEFAULT;

-- Enforce primary key on webhook_events if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class conrel ON c.conrelid = conrel.oid
    JOIN pg_namespace conns ON conrel.relnamespace = conns.oid
    WHERE conns.nspname = 'public' 
      AND conrel.relname = 'webhook_events' 
      AND c.contype = 'p'
  ) THEN
    UPDATE public.webhook_events SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.webhook_events ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.webhook_events ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Check for duplicate event_id before unique index
DO $$
DECLARE
  v_dup_event RECORD;
BEGIN
  FOR v_dup_event IN
    SELECT event_id, COUNT(*) AS cnt
    FROM public.webhook_events
    WHERE event_id IS NOT NULL AND trim(event_id) <> ''
    GROUP BY event_id
    HAVING COUNT(*) > 1
  LOOP
    RAISE EXCEPTION 'Cannot reconcile public.webhook_events: found duplicate event_id "%" (% occurrences). Manual resolution required before creating unique index.', v_dup_event.event_id, v_dup_event.cnt;
  END LOOP;
END $$;

-- 8.1 Reconcile webhook fields safely
UPDATE public.webhook_events SET event_type = 'unknown' WHERE event_type IS NULL OR trim(event_type) = '';
UPDATE public.webhook_events SET payload = '{}'::jsonb WHERE payload IS NULL;

-- Normalize existing statuses without falsely marking unprocessed events as processed
UPDATE public.webhook_events
SET status = 'received'
WHERE status IS NULL;

-- If marked processed historically but missing processed_at, set to created_at
UPDATE public.webhook_events
SET processed_at = created_at
WHERE status = 'processed' AND processed_at IS NULL;

-- 8.2 Constraint Ordering on webhook_events
ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_status_check;

UPDATE public.webhook_events
SET status = 'received'
WHERE status NOT IN ('received', 'pending', 'processed', 'failed', 'ignored');

ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_status_check
  CHECK (status IN ('received', 'pending', 'processed', 'failed', 'ignored'));

ALTER TABLE public.webhook_events
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN payload SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id_unique 
  ON public.webhook_events(event_id) 
  WHERE event_id IS NOT NULL AND trim(event_id) <> '';
CREATE INDEX IF NOT EXISTS idx_webhook_events_ref ON public.webhook_events(reference);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.webhook_events(event_type);

-- ==============================================================================
-- 9. Full RLS Policy Audit & Table Privilege Hardening
-- ==============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Drop all previous policies regardless of name
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' 
      AND tablename IN ('subscriptions', 'payment_transactions', 'webhook_events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Read-only policy for authenticated users on their own subscription records
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Read-only policy for authenticated users on their own payment transactions
CREATE POLICY "Users can read own payment transactions"
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Explicitly revoke table privileges from untrusted roles (client-side immutability)
REVOKE ALL ON public.subscriptions, public.payment_transactions, public.webhook_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions, public.payment_transactions, public.webhook_events FROM authenticated;
GRANT SELECT ON public.subscriptions, public.payment_transactions TO authenticated;
REVOKE ALL ON public.webhook_events FROM authenticated;

-- ==============================================================================
-- 10. Dependency-Safe Legacy Trigger & Function Cleanup
-- Avoids blind CASCADE to protect unrelated triggers or dependent database objects.
-- ==============================================================================

DO $$
DECLARE
  v_dep_count INTEGER;
BEGIN
  -- Drop known triggers on profiles first
  DROP TRIGGER IF EXISTS profiles_protect ON public.profiles;
  DROP TRIGGER IF EXISTS trg_protect_profile_subscription ON public.profiles;

  -- Inspect pg_depend for any remaining external dependencies on profiles_protect function
  SELECT COUNT(*) INTO v_dep_count
  FROM pg_depend dep
  JOIN pg_proc proc ON dep.objid = proc.oid
  WHERE proc.proname = 'profiles_protect'
    AND dep.deptype NOT IN ('i', 'a');

  IF v_dep_count = 0 THEN
    DROP FUNCTION IF EXISTS public.profiles_protect();
  ELSE
    -- If external dependencies exist, drop with RESTRICT to guarantee no unintended drops
    DROP FUNCTION IF EXISTS public.profiles_protect() RESTRICT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fallback safe drop
  DROP FUNCTION IF EXISTS public.profiles_protect();
END $$;

-- ==============================================================================
-- 11. Profiles Defaults, Columns & Null Value Normalization
-- ==============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN tier SET DEFAULT 'free',
  ALTER COLUMN is_pro SET DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_tier SET DEFAULT 'free',
  ALTER COLUMN subscription_status SET DEFAULT 'inactive',
  ALTER COLUMN payment_status SET DEFAULT 'none';

-- Normalize NULL or empty strings in existing profiles
UPDATE public.profiles
SET 
  subscription_tier = COALESCE(NULLIF(subscription_tier, ''), COALESCE(NULLIF(tier, ''), 'free')),
  subscription_status = COALESCE(NULLIF(subscription_status, ''), 'inactive'),
  payment_status = COALESCE(NULLIF(payment_status, ''), 'none')
WHERE subscription_tier IS NULL OR subscription_status IS NULL OR payment_status IS NULL
   OR subscription_tier = '' OR subscription_status = '' OR payment_status = '';

-- ==============================================================================
-- 12. Subscription Reconciliation & Synchronization
-- Preserves legitimate manual_admin and verified Paystack subscribers; demotes all others.
-- ==============================================================================

-- 12.1 Demote any profile marked pro/paid that DOES NOT have a legitimate, unexpired, paid subscription
UPDATE public.profiles p
SET 
  tier = 'free',
  is_pro = false,
  subscription_tier = 'free',
  subscription_status = CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.subscriptions s 
      WHERE s.user_id = p.id AND (s.status = 'expired' OR (s.current_period_end IS NOT NULL AND s.current_period_end <= now()))
    ) THEN 'expired'
    ELSE 'inactive'
  END,
  payment_status = 'none',
  subscription_end = NULL
WHERE (p.tier IN ('scholar', 'sage', 'plus', 'studio') OR p.is_pro = true)
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p.id 
      AND (
        -- Legitimate manual administrator override subscription
        (s.payment_provider = 'manual_admin' 
         AND s.status = 'manual_active' 
         AND s.payment_status = 'paid' 
         AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR
        -- Legitimate verified Paystack subscription with positive amount and valid unexpired period
        (s.payment_provider = 'paystack' 
         AND s.status = 'active' 
         AND s.payment_status = 'paid' 
         AND s.amount_paid > 0 
         AND s.payment_reference IS NOT NULL 
         AND trim(s.payment_reference) <> ''
         AND s.current_period_end IS NOT NULL 
         AND s.current_period_end > now())
      )
  );

-- 12.2 Sync verified, active, unexpired paid subscriptions into profiles
UPDATE public.profiles p
SET 
  tier = s.plan_tier,
  is_pro = true,
  subscription_tier = s.plan_tier,
  subscription_status = s.status,
  payment_status = 'paid',
  subscription_end = s.current_period_end
FROM (
  SELECT DISTINCT ON (user_id) 
    user_id, plan_tier, status, current_period_end
  FROM public.subscriptions
  WHERE payment_status = 'paid'
    AND (
      (payment_provider = 'manual_admin' AND status = 'manual_active' AND (current_period_end IS NULL OR current_period_end > now()))
      OR
      (payment_provider = 'paystack' AND status = 'active' AND amount_paid > 0 AND payment_reference IS NOT NULL AND current_period_end IS NOT NULL AND current_period_end > now())
    )
  ORDER BY user_id, current_period_start DESC
) s
WHERE p.id = s.user_id;

-- ==============================================================================
-- 13. Consolidated Profile Protection Trigger
-- Protects tier, is_pro, subscription_tier, subscription_status, payment_status,
-- subscription_end, and paystack_customer_code from client tampering.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
  v_jwt_role text;
BEGIN
  -- Safe extraction of JWT role claim if present (Supabase PostgREST context)
  BEGIN
    v_jwt_role := COALESCE(
      current_setting('request.jwt.claim.role', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
    );
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  v_role := COALESCE(v_jwt_role, current_setting('role', true), current_user);

  -- Backend service_role or administrative postgres context can freely update tiers and status
  IF v_role = 'service_role' 
     OR session_user IN ('postgres', 'supabase_admin') 
     OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Client-initiated updates cannot alter subscription tier or pro status directly
  IF (TG_OP = 'UPDATE') THEN
    NEW.tier := OLD.tier;
    NEW.is_pro := OLD.is_pro;
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_status := OLD.subscription_status;
    NEW.payment_status := OLD.payment_status;
    NEW.subscription_end := OLD.subscription_end;
    NEW.paystack_customer_code := OLD.paystack_customer_code;
  ELSIF (TG_OP = 'INSERT') THEN
    -- Newly inserted profile from client must always start on the Free plan
    NEW.tier := 'free';
    NEW.is_pro := false;
    NEW.subscription_tier := 'free';
    NEW.subscription_status := 'inactive';
    NEW.payment_status := 'none';
    NEW.subscription_end := NULL;
    NEW.paystack_customer_code := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profile_subscription ON public.profiles;
CREATE TRIGGER trg_protect_profile_subscription
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_subscription();

COMMENT ON TABLE public.subscriptions IS 'Tracks verified user subscriptions, status, and Paystack recurring codes';
COMMENT ON TABLE public.payment_transactions IS 'Immutable ledger of all initial and recurring payment transactions';
COMMENT ON TABLE public.webhook_events IS 'Idempotent audit log of all inbound Paystack webhook events with lifecycle status';

COMMIT;

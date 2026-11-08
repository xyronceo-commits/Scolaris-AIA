-- ==============================================================================
-- KorsIQ Migration: Complete Paystack Security & Subscription Remediation
-- Transaction-safe, idempotent, and backward/forward compatible.
-- 
-- Order of Execution:
--   1. Schema Reconciliation for public.subscriptions (creates table + reconciles every column)
--   2. Constraint Sanitization & Hardening on subscriptions (no silent exception swallowing)
--   3. Schema Reconciliation for public.payment_transactions (immutable ledger)
--   4. Schema Reconciliation for public.webhook_events (idempotent audit log)
--   5. Full RLS Policy Audit & Re-creation via pg_policies inspection
--   6. Legacy Trigger & Function Cleanup
--   7. Profiles Defaults, Columns & Null Value Normalization
--   8. Legacy Account Reconciliation (Preserving verified paid subscribers)
--   9. Consolidated Profile Protection Trigger
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. Schema Reconciliation for public.subscriptions
-- ==============================================================================

-- If legacy 'plan' column exists instead of 'plan_tier', rename it
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

-- Create table if it does not exist at all
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'paid',
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
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid',
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

-- Ensure foreign key constraint exists on user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'subscriptions_user_id_fkey' 
      AND table_schema = 'public' 
      AND table_name = 'subscriptions'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Normalize null values on mandatory columns before applying NOT NULL constraints
UPDATE public.subscriptions SET plan_tier = 'free' WHERE plan_tier IS NULL;
UPDATE public.subscriptions SET billing_cycle = 'monthly' WHERE billing_cycle IS NULL;
UPDATE public.subscriptions SET status = 'active' WHERE status IS NULL;
UPDATE public.subscriptions SET payment_provider = 'paystack' WHERE payment_provider IS NULL;
UPDATE public.subscriptions SET payment_status = 'paid' WHERE payment_status IS NULL;
UPDATE public.subscriptions SET amount_paid = 0 WHERE amount_paid IS NULL;
UPDATE public.subscriptions SET currency = 'NGN' WHERE currency IS NULL;
UPDATE public.subscriptions SET current_period_start = now() WHERE current_period_start IS NULL;
UPDATE public.subscriptions SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE public.subscriptions SET created_at = now() WHERE created_at IS NULL;
UPDATE public.subscriptions SET updated_at = now() WHERE updated_at IS NULL;

-- Enforce column NOT NULL constraints
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

-- ==============================================================================
-- 2. Constraint Sanitization & Hardening (No Silent Exceptions)
-- ==============================================================================

-- Reconcile and install subscriptions_plan_tier_check
UPDATE public.subscriptions
SET plan_tier = 'free'
WHERE plan_tier NOT IN ('free', 'plus', 'studio', 'scholar', 'sage');

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier IN ('free', 'plus', 'studio', 'scholar', 'sage'));

-- Reconcile and install subscriptions_billing_cycle_check
UPDATE public.subscriptions
SET billing_cycle = 'monthly'
WHERE billing_cycle NOT IN ('monthly', 'annual');

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check
  CHECK (billing_cycle IN ('monthly', 'annual'));

-- Reconcile and install subscriptions_status_check
UPDATE public.subscriptions
SET status = 'active'
WHERE status NOT IN ('active', 'pending', 'cancelled', 'expired', 'failed', 'past_due', 'manual_active', 'inactive');

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'pending', 'cancelled', 'expired', 'failed', 'past_due', 'manual_active', 'inactive'));

-- Reconcile and install subscriptions_payment_provider_check
UPDATE public.subscriptions
SET payment_provider = 'paystack'
WHERE payment_provider NOT IN ('paystack', 'manual_admin', 'test');

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_provider_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_payment_provider_check
  CHECK (payment_provider IN ('paystack', 'manual_admin', 'test'));

-- Reconcile and install subscriptions_payment_status_check
UPDATE public.subscriptions
SET payment_status = 'paid'
WHERE payment_status NOT IN ('paid', 'pending', 'failed', 'abandoned', 'cancelled', 'refunded', 'none');

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_payment_status_check
  CHECK (payment_status IN ('paid', 'pending', 'failed', 'abandoned', 'cancelled', 'refunded', 'none'));

-- Indexes and unique constraint on payment_reference
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment_reference_unique 
  ON public.subscriptions(payment_reference) 
  WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ==============================================================================
-- 3. Dedicated payment transaction ledger (public.payment_transactions)
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

-- Ensure foreign key exists on payment_transactions(user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'payment_transactions_user_id_fkey' 
      AND table_schema = 'public' 
      AND table_name = 'payment_transactions'
  ) THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Reconcile and install payment_transactions constraints
UPDATE public.payment_transactions
SET status = 'pending'
WHERE status NOT IN ('pending', 'success', 'failed', 'abandoned', 'cancelled', 'refunded', 'reversed')
   OR status IS NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'abandoned', 'cancelled', 'refunded', 'reversed'));

UPDATE public.payment_transactions
SET plan_tier = 'plus'
WHERE plan_tier NOT IN ('plus', 'studio')
   OR plan_tier IS NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_plan_tier_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_plan_tier_check
  CHECK (plan_tier IN ('plus', 'studio'));

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_ref_unique ON public.payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);

-- ==============================================================================
-- 4. Dedicated webhook event audit log (public.webhook_events)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT,
  event_type TEXT NOT NULL,
  reference TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  error_message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.webhook_events
SET status = 'processed'
WHERE status NOT IN ('processed', 'failed', 'ignored')
   OR status IS NULL;

ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_status_check;
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_status_check
  CHECK (status IN ('processed', 'failed', 'ignored'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id_unique ON public.webhook_events(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_ref ON public.webhook_events(reference);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.webhook_events(event_type);

-- ==============================================================================
-- 5. Audit and Correct All Existing RLS Policies
-- Inspects pg_policies and drops all previous policies regardless of name
-- ==============================================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

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

-- Policy 1: Authenticated users can SELECT only their own subscription records
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: Authenticated users can SELECT only their own payment transactions
CREATE POLICY "Users can read own payment transactions"
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Note on ledger immutability and service_role:
-- Authenticated and anonymous roles have NO INSERT, UPDATE, or DELETE policies on subscriptions
-- or payment_transactions, guaranteeing client-side immutability.
-- Webhook events has NO user policies, blocking all user access.
-- The backend service_role bypasses RLS in Supabase, allowing legitimate server operations
-- (lifecycle transitions from pending -> success/failed and webhook audit logging) to proceed.

-- ==============================================================================
-- 6. Drop legacy triggers and orphan functions on public.profiles
-- ==============================================================================
DROP TRIGGER IF EXISTS profiles_protect ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_subscription ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_protect() CASCADE;

-- ==============================================================================
-- 7. Ensure public.profiles subscription columns and defaults exist
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

-- Normalize any NULL or empty string fields in existing profiles
UPDATE public.profiles
SET 
  subscription_tier = COALESCE(NULLIF(subscription_tier, ''), COALESCE(NULLIF(tier, ''), 'free')),
  subscription_status = COALESCE(NULLIF(subscription_status, ''), 'inactive'),
  payment_status = COALESCE(NULLIF(payment_status, ''), 'none')
WHERE subscription_tier IS NULL OR subscription_status IS NULL OR payment_status IS NULL
   OR subscription_tier = '' OR subscription_status = '' OR payment_status = '';

-- ==============================================================================
-- 8. Reconcile unverified legacy scholar accounts to free tier
-- Preserves every user who has a genuinely verified paid active subscription record
-- ==============================================================================
UPDATE public.profiles p
SET 
  tier = 'free',
  is_pro = false,
  subscription_tier = 'free',
  subscription_status = 'inactive',
  payment_status = 'none'
WHERE (p.tier = 'scholar' OR p.tier = 'sage' OR p.is_pro = true)
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p.id 
      AND s.payment_status = 'paid' 
      AND s.status IN ('active', 'manual_active')
  );

-- ==============================================================================
-- 9. Consolidated Profile Protection Trigger
-- Protects tier, is_pro, subscription_tier, subscription_status, payment_status,
-- subscription_end, and paystack_customer_code from client tampering.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
  v_jwt_role text;
BEGIN
  -- Safe extraction of JWT role claim if present (Supabase PostgREST sets this)
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

CREATE TRIGGER trg_protect_profile_subscription
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_subscription();

COMMENT ON TABLE public.subscriptions IS 'Tracks verified user subscriptions, status, and Paystack recurring codes';
COMMENT ON TABLE public.payment_transactions IS 'Immutable ledger of all initial and recurring payment transactions';
COMMENT ON TABLE public.webhook_events IS 'Idempotent log of all inbound Paystack webhook events';

COMMIT;

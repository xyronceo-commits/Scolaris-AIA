-- ==============================================================================
-- KorsIQ Migration: Subscriptions, Payment Verification, and Free Plan Defaults
-- Enforces free plan by default for all new users, distinguishes plan/payment/status,
-- prevents client-side tampering of tiers, and preserves legitimate active paid records.
-- ==============================================================================

-- 1. Ensure public.profiles defaults to 'free' and is_pro to false
ALTER TABLE public.profiles
  ALTER COLUMN tier SET DEFAULT 'free',
  ALTER COLUMN is_pro SET DEFAULT false;

-- 2. Add subscription & payment tracking columns to public.profiles if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;

-- 3. Only populate null/empty tiers with 'free', preserving any legitimate active 'scholar' or 'sage' users
UPDATE public.profiles
SET 
  tier = COALESCE(NULLIF(tier, ''), 'free'),
  is_pro = CASE WHEN tier IN ('scholar', 'sage', 'plus', 'studio') THEN is_pro ELSE false END,
  subscription_tier = COALESCE(NULLIF(subscription_tier, ''), COALESCE(NULLIF(tier, ''), 'free')),
  subscription_status = CASE WHEN tier IN ('scholar', 'sage', 'plus', 'studio') AND is_pro = true THEN 'active' ELSE 'inactive' END
WHERE tier IS NULL OR tier = '' OR subscription_tier IS NULL;

-- 4. Create public.subscriptions table for complete audit, idempotency, and status tracking
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('free', 'plus', 'studio', 'scholar', 'sage')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'cancelled', 'expired', 'failed')),
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  payment_reference TEXT UNIQUE, -- Unique reference prevents duplicate activations / replay callbacks
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'failed', 'abandoned', 'cancelled', 'refunded')),
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ref ON public.subscriptions(payment_reference);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 6. Row Level Security for subscriptions table
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop prior policy if exists to allow re-runs
DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Note: Authenticated users CANNOT insert/update/delete records in subscriptions directly.
-- Only the backend server running with service_role permissions can insert or update verified payments.

-- 7. Trigger to prevent client-side tampering of tier and is_pro on public.profiles
CREATE OR REPLACE FUNCTION public.protect_profile_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- If executed via backend service-role or postgres administrative context, allow full modification
  IF current_user = 'service_role' OR current_setting('role', true) = 'service_role' THEN
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
  ELSIF (TG_OP = 'INSERT') THEN
    -- Newly inserted profile from client must always start on the Free plan
    NEW.tier := 'free';
    NEW.is_pro := false;
    NEW.subscription_tier := 'free';
    NEW.subscription_status := 'inactive';
    NEW.payment_status := 'none';
    NEW.subscription_end := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_subscription ON public.profiles;
CREATE TRIGGER trg_protect_profile_subscription
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_subscription();

COMMENT ON TABLE public.subscriptions IS 'Tracks verified user subscriptions and payment statuses';
COMMENT ON COLUMN public.subscriptions.payment_reference IS 'Unique gateway transaction reference enforcing idempotency';

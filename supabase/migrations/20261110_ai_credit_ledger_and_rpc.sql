-- ==============================================================================
-- KorsIQ Migration: Atomic AI Credit Ledger & Spend/Refund RPCs (2026-11-10)
-- ==============================================================================
-- Replaces raw "AI usage" counters with an auditable, idempotent AI credit ledger
-- and atomic Postgres RPCs for Study Hub tools and Academic Studio only.
-- Chatbot, Academic Adviser, Planner, and Timetable are NOT metered.
--
-- Monthly credit allowances:
--   Free   :  20 credits / month
--   Plus   : 150 credits / month
--   Studio : 200 credits / month
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL, -- negative for spend, positive for refund or admin adjustment
  entry_type TEXT NOT NULL CHECK (entry_type IN ('spend', 'refund', 'admin_adjust')),
  feature TEXT NOT NULL,
  request_id TEXT UNIQUE,
  period_start TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_user_period
  ON public.ai_credit_ledger(user_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_created
  ON public.ai_credit_ledger(created_at DESC);

ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own ai credit ledger" ON public.ai_credit_ledger;
CREATE POLICY "Users can read own ai credit ledger"
  ON public.ai_credit_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Strict server-only write enforcement: clients cannot insert/update/delete ledger rows directly
REVOKE INSERT, UPDATE, DELETE ON public.ai_credit_ledger FROM anon, authenticated;

-- Helper function: compute current billing period allowance and balance for a user
CREATE OR REPLACE FUNCTION public.get_ai_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_tier TEXT := 'free';
  v_tier TEXT := 'free';
  v_allowance INTEGER := 20;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_net_delta INTEGER := 0;
  v_used INTEGER := 0;
  v_balance INTEGER := 20;
BEGIN
  v_period_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_period_end := (date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC';

  SELECT COALESCE(NULLIF(subscription_tier, ''), NULLIF(tier, ''), 'free')
    INTO v_raw_tier
    FROM public.profiles
   WHERE id = p_user_id;

  v_raw_tier := lower(COALESCE(v_raw_tier, 'free'));
  IF v_raw_tier IN ('studio', 'sage', 'premium') THEN
    v_tier := 'studio';
    v_allowance := 200;
  ELSIF v_raw_tier IN ('plus', 'scholar') THEN
    v_tier := 'plus';
    v_allowance := 150;
  ELSE
    v_tier := 'free';
    v_allowance := 20;
  END IF;

  SELECT COALESCE(SUM(delta), 0)
    INTO v_net_delta
    FROM public.ai_credit_ledger
   WHERE user_id = p_user_id
     AND created_at >= v_period_start;

  -- v_net_delta is negative when credits have been spent
  v_balance := GREATEST(0, v_allowance + v_net_delta);
  v_used := GREATEST(0, -v_net_delta);

  RETURN jsonb_build_object(
    'balance', v_balance,
    'used', v_used,
    'allowance', v_allowance,
    'tier', v_tier,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

-- Atomic credit spend RPC: locks the user's profile row to serialize concurrent spends,
-- checks balance >= p_cost, and inserts a negative delta row idempotently by p_request_id.
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_user_id UUID,
  p_cost INTEGER,
  p_feature TEXT,
  p_request_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status JSONB;
  v_balance INTEGER;
  v_allowance INTEGER;
  v_used INTEGER;
  v_tier TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_existing_id UUID;
BEGIN
  IF p_cost <= 0 THEN
    RETURN public.get_ai_credit_balance(p_user_id) || jsonb_build_object('success', true);
  END IF;

  -- Serialize concurrent credit spends for this user
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  -- Idempotency check: if this request_id was already charged, return current balance without double charging
  IF p_request_id IS NOT NULL AND length(trim(p_request_id)) > 0 THEN
    SELECT id INTO v_existing_id
      FROM public.ai_credit_ledger
     WHERE request_id = p_request_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_status := public.get_ai_credit_balance(p_user_id);
      RETURN v_status || jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  v_status := public.get_ai_credit_balance(p_user_id);
  v_balance := (v_status->>'balance')::INTEGER;
  v_allowance := (v_status->>'allowance')::INTEGER;
  v_used := (v_status->>'used')::INTEGER;
  v_tier := v_status->>'tier';
  v_period_start := (v_status->>'period_start')::TIMESTAMPTZ;
  v_period_end := (v_status->>'period_end')::TIMESTAMPTZ;

  IF v_balance < p_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_CREDITS',
      'balance', v_balance,
      'used', v_used,
      'allowance', v_allowance,
      'required', p_cost,
      'tier', v_tier,
      'period_start', v_period_start,
      'period_end', v_period_end
    );
  END IF;

  INSERT INTO public.ai_credit_ledger (
    user_id,
    delta,
    entry_type,
    feature,
    request_id,
    period_start
  ) VALUES (
    p_user_id,
    -p_cost,
    'spend',
    p_feature,
    NULLIF(trim(p_request_id), ''),
    v_period_start
  );

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance - p_cost,
    'used', v_used + p_cost,
    'allowance', v_allowance,
    'charged', p_cost,
    'tier', v_tier,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

-- Atomic credit refund RPC: idempotently refunds a previously charged request_id when an AI call fails
CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user_id UUID,
  p_request_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig RECORD;
  v_refund_req_id TEXT;
BEGIN
  IF p_request_id IS NULL OR length(trim(p_request_id)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing request_id');
  END IF;

  v_refund_req_id := trim(p_request_id) || ':refund';

  SELECT * INTO v_orig
    FROM public.ai_credit_ledger
   WHERE user_id = p_user_id
     AND request_id = trim(p_request_id)
     AND entry_type = 'spend'
   LIMIT 1;

  IF v_orig IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original spend not found');
  END IF;

  INSERT INTO public.ai_credit_ledger (
    user_id,
    delta,
    entry_type,
    feature,
    request_id,
    period_start,
    metadata
  ) VALUES (
    p_user_id,
    ABS(v_orig.delta),
    'refund',
    v_orig.feature,
    v_refund_req_id,
    v_orig.period_start,
    jsonb_build_object('refunded_request_id', trim(p_request_id))
  )
  ON CONFLICT (request_id) DO NOTHING;

  RETURN public.get_ai_credit_balance(p_user_id) || jsonb_build_object('success', true, 'refunded', ABS(v_orig.delta));
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credits(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_credits(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_balance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(UUID, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(UUID, TEXT) TO service_role;

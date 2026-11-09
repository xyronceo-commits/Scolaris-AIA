-- =============================================================================
-- KorsIQ AI Credits Usage Metering Table & RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credits INTEGER NOT NULL DEFAULT 1 CHECK (credits > 0),
    feature TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
    ON public.ai_usage (user_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own ai_usage" ON public.ai_usage;
CREATE POLICY "Users can select own ai_usage"
    ON public.ai_usage
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai_usage" ON public.ai_usage;
CREATE POLICY "Users can insert own ai_usage"
    ON public.ai_usage
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

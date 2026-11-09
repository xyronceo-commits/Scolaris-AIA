-- =============================================================================
-- KorsIQ Super Admin Seed Script (Example)
-- =============================================================================
-- HOW TO USE:
-- 1. Open your Supabase Dashboard -> SQL Editor -> New Query.
-- 2. Replace 'YOUR_EMAIL@example.com' below with your real email address.
-- 3. Click Run.
-- =============================================================================

-- 1. Ensure the admin_users and admin_audit_log tables exist with strict RLS
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'moderator')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct client access to admin_users" ON public.admin_users;
CREATE POLICY "No direct client access to admin_users"
    ON public.admin_users FOR ALL USING (false);

DROP POLICY IF EXISTS "No direct client access to admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "No direct client access to admin_audit_log"
    ON public.admin_audit_log FOR ALL USING (false);

-- 2. Insert or update your email as an active super_admin (always stored lowercase)
INSERT INTO public.admin_users (email, role, active)
VALUES (lower(trim('YOUR_EMAIL@example.com')), 'super_admin', true)
ON CONFLICT (email) DO UPDATE
SET role = 'super_admin',
    active = true;

-- 3. Verification query: confirms your admin_users row is active and checks if
--    an auth.users row already exists (if not, /api/admin/auth/request-otp will
--    auto-create it using SUPABASE_SERVICE_ROLE_KEY when you request a code).
SELECT
    a.id AS admin_id,
    a.email AS admin_email,
    a.role,
    a.active,
    a.created_at,
    (u.id IS NOT NULL) AS exists_in_auth_users
FROM public.admin_users a
LEFT JOIN auth.users u ON lower(u.email) = lower(a.email)
WHERE lower(a.email) = lower(trim('YOUR_EMAIL@example.com'));

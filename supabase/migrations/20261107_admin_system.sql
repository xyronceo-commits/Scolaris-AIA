-- ==============================================================================
-- KorsIQ Migration: Comprehensive Admin System & Operational Management
-- Supports Super Admin (buildsafe247@gmail.com), Role-based Access, OTP Security,
-- Announcements, Dynamic Universities, Platform Settings, and Audit Trail.
-- ==============================================================================

-- 1. Administrators Table
-- An earlier migration created public.admins as (user_id PRIMARY KEY, created_at) for RLS checks.
-- This system needs email-keyed administrators that MAY also be linked to a student account, so the
-- older shape is upgraded in place below (idempotent; a fresh database gets the final shape directly).
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'finance_admin', 'support_admin')),
  full_name TEXT,
  created_by TEXT DEFAULT 'system',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  pk_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.admins ADD COLUMN id UUID DEFAULT gen_random_uuid();
    ALTER TABLE public.admins ALTER COLUMN id SET NOT NULL;

    SELECT conname INTO pk_name FROM pg_constraint
    WHERE conrelid = 'public.admins'::regclass AND contype = 'p';
    EXECUTE format('ALTER TABLE public.admins DROP CONSTRAINT %I', pk_name);
    ALTER TABLE public.admins ADD PRIMARY KEY (id);

    ALTER TABLE public.admins ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.admins ADD CONSTRAINT admins_user_id_key UNIQUE (user_id);

    ALTER TABLE public.admins
      ADD COLUMN email TEXT,
      ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'
        CHECK (role IN ('super_admin', 'admin', 'finance_admin', 'support_admin')),
      ADD COLUMN full_name TEXT,
      ADD COLUMN created_by TEXT DEFAULT 'system',
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    -- Existing admins were identified by user_id only: take their email from their account.
    UPDATE public.admins a SET email = lower(u.email) FROM auth.users u WHERE u.id = a.user_id;
    -- Fails loudly (and rolls everything back) if an admin row has no email, instead of guessing.
    ALTER TABLE public.admins ALTER COLUMN email SET NOT NULL;
    ALTER TABLE public.admins ADD CONSTRAINT admins_email_key UNIQUE (email);
  END IF;
END $$;

-- is_admin() backs the RLS policies on other tables: an administrator who has been deactivated
-- must lose that access immediately.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid() AND is_active)
$$;

-- Seed Designated Super Admin: buildsafe247@gmail.com
INSERT INTO public.admins (email, role, full_name, is_active)
VALUES ('buildsafe247@gmail.com', 'super_admin', 'Super Administrator', true)
ON CONFLICT (email) DO UPDATE SET role = 'super_admin', is_active = true;

-- 2. Admin One-Time Passwords (OTPs)
CREATE TABLE IF NOT EXISTS public.admin_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_otps_lookup ON public.admin_otps(email, used, expires_at);

-- 3. Security Audit Logs
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON public.admin_logs(created_at DESC);

-- 4. Announcements Table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'free', 'plus', 'studio')),
  author_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements(target_audience, is_active);

-- 5. Universities Table
CREATE TABLE IF NOT EXISTS public.universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  acronym TEXT,
  type TEXT NOT NULL CHECK (type IN ('Federal', 'State', 'Private')),
  state TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_universities_active ON public.universities(is_active);

-- 6. Platform Settings Table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial default platform settings
INSERT INTO public.platform_settings (key, value, description, updated_by)
VALUES 
  ('maintenance_mode', '{"enabled": false, "message": "KorsIQ is undergoing scheduled maintenance. Please check back shortly."}'::jsonb, 'Site-wide maintenance mode', 'system'),
  ('registrations_open', '{"enabled": true}'::jsonb, 'Allow new student registrations', 'system'),
  ('default_storage_mb', '{"free": 500, "plus": 2048, "studio": 10240}'::jsonb, 'Storage allowances per plan tier in MB', 'system'),
  ('support_contact', '{"email": "support@korsiq.app", "phone": "+2348000000000"}'::jsonb, 'Contact information shown to users', 'system')
ON CONFLICT (key) DO NOTHING;

-- 7. Add user suspension tracking to public.profiles if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- A student can update their own profile row, so without this a suspended student could simply
-- set is_suspended back to false. Only the server (service role) or the database owner may change it.
CREATE OR REPLACE FUNCTION public.protect_profile_suspension() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_suspended := false;
      NEW.suspension_reason := NULL;
    ELSE
      NEW.is_suspended := OLD.is_suspended;
      NEW.suspension_reason := OLD.suspension_reason;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_profile_suspension ON public.profiles;
CREATE TRIGGER trg_protect_profile_suspension
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_suspension();

-- 8. Row Level Security
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_otps ENABLE ROW LEVEL SECURITY;
-- One-time admin codes are only ever read and written by the server (service role). RLS already hides every
-- row from students; revoking the table privileges as well means no API role can even attempt to query it.
REVOKE ALL ON public.admin_otps FROM anon, authenticated;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Public can read active announcements and active universities
DROP POLICY IF EXISTS "Anyone can view active announcements" ON public.announcements;
CREATE POLICY "Anyone can view active announcements"
  ON public.announcements FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view active universities" ON public.universities;
CREATE POLICY "Anyone can view active universities"
  ON public.universities FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view public settings" ON public.platform_settings;
CREATE POLICY "Anyone can view public settings"
  ON public.platform_settings FOR SELECT
  USING (key IN ('maintenance_mode', 'registrations_open', 'support_contact'));

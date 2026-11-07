-- ==============================================================================
-- KorsIQ Migration: Comprehensive Admin System & Operational Management
-- Supports Super Admin (buildsafe247@gmail.com), Role-based Access, OTP Security,
-- Announcements, Dynamic Universities, Platform Settings, and Audit Trail.
-- ==============================================================================

-- 1. Administrators Table
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'finance_admin', 'support_admin')),
  full_name TEXT,
  created_by TEXT DEFAULT 'system',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- 8. Row Level Security
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_otps ENABLE ROW LEVEL SECURITY;
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

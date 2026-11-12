-- Trigger functions must never be callable directly through the API (RPC).
-- They only need to run as triggers, which does not require EXECUTE for client roles.
REVOKE ALL ON FUNCTION public.handle_circle_reply_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_study_group_owner() FROM PUBLIC, anon, authenticated;

-- Pin the search_path of the profile subscription guard so it cannot be hijacked via a shadowing schema.
ALTER FUNCTION public.protect_profile_subscription() SET search_path = public;

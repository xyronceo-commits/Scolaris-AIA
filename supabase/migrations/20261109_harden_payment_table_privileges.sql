-- Remove leftover privileges from client roles on payment tables.
-- 20261107_paystack_security_remediation revoked INSERT/UPDATE/DELETE but left TRUNCATE, REFERENCES and TRIGGER.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions, public.payment_transactions, public.webhook_events FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions, public.payment_transactions, public.webhook_events FROM anon;
GRANT SELECT ON public.subscriptions, public.payment_transactions TO authenticated;

# Database migration status (live Supabase project: scolaris-ai)

The live database was migrated through the Supabase dashboard/MCP, NOT through `supabase db push`, so the CLI migration history does not match the files in `supabase/migrations/`. Do not run `supabase db push` against the live project. Apply new files manually, in filename order, after reading them.

## Applied (9 Nov 2026)
- 20261106_academic_studio (column `references` is quoted: it is a reserved word)
- 20261106_circle_invite_active
- 20261106_onboarding_fields
- 20261107_academic_tasks_and_notifications
- 20261107_admin_system
- 20261107_paystack_security_remediation
- 20261107_user_files_status
- 20261108_repair_missing_tables_and_columns
- 20261109_circle_realtime_chat_and_resources (owner_id is a uuid; compared as uuid, not text)
- 20261109_harden_payment_table_privileges

## Removed / moved
- `20261107_subscriptions_and_free_tier.sql` was deleted. It predates the Paystack remediation and would overwrite the hardened `protect_profile_subscription` trigger with a weaker SECURITY DEFINER version. The remediation covers everything it did.
- `20261107_paystack_verification.sql` was a read-only audit script, not a migration. It now lives in `supabase/diagnostics/paystack_verification_audit.sql`.

## Never run automatically
- `supabase/manual/clean_demo_rows.sql` deletes data (moved out of migrations so no tool runs it automatically). Review it and run it by hand only if intended.

## Applied 11 Nov 2026
- 20261111_harden_functions_and_triggers: trigger functions are no longer executable through the API, and `protect_profile_subscription` has a pinned search_path.

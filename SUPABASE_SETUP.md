# Supabase setup (Firebase → Supabase migration)

Auth, database and file storage now run on Supabase. Firebase has been removed.

## 1. Environment variables
Copy `.env.example` to `.env` (local) and set the same names in your hosting provider.

| Variable | Where it's used |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser + server (public/publishable values) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Admin dashboard + audit logs. Never expose to the browser |
| `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | Shared-library uploads (`/api/s3/*`). Create under Storage → S3 Connection |

## 2. Make sign-up send a one-time code (required)
Dashboard → Authentication:

1. **Providers → Email**: keep *Confirm email* **on**.
2. **Email Templates → Confirm signup**: the template must contain `{{ .Token }}` (the 6-digit code). Example body:
   ```html
   <h2>Verify your Scolaris account</h2>
   <p>Your verification code is:</p>
   <h1 style="letter-spacing:6px">{{ .Token }}</h1>
   <p>It expires in 1 hour. If you didn't sign up, ignore this email.</p>
   ```
   (If the template only contains `{{ .ConfirmationURL }}`, users receive a link instead of a code and cannot finish the OTP screen.)
3. **SMTP Settings**: configure a custom SMTP provider (Resend, Brevo, Postmark, etc.). Supabase's built-in sender only delivers to your own team members and is heavily rate-limited, so real students will not receive codes without this.

## 3. Admin access
- The admin portal password login (`ADMIN_PASSWORD`) works as before.
- To also grant a Supabase user admin rights: `insert into public.admins (user_id) values ('<auth user uuid>');`

## 4. Security model (Row Level Security)
- Users can only read/write their own profile, courses, schedule, study hubs and files.
- Users cannot change their own `tier` / `is_pro` (new users default to `scholar` + Pro, matching previous behaviour; change the column defaults in `public.profiles` to alter this).
- Public ("general") study groups are visible to everyone signed in; private groups only to members. Joining a private group goes through `join_group()` with the invite code.
- Group members can edit discussions/chat but not ownership, membership or the invite code.
- File buckets (`user-files`, `group-materials`) are private; the app uses short-lived signed URLs.

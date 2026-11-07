# 05 Current app vs specs: gap notes

> **These notes were written by reading the code on `main` on 7 November 2026, not taken from the design PDFs.** They record where the running app differs from `01` to `04` so nobody has to rediscover it. Re-check against the code before relying on any line; the app changes quickly.

Items marked **Decision needed** must be settled by the product owner. Do not silently pick one side.

## Authentication

| Spec | Current app |
|------|-------------|
| Email **code sign-in**: one email field, `Send code`, then a six-box code entry. No password. | Email **and password**. Sign-up emails a one-time code to verify the address; sign-in uses the password. Modes: sign in, sign up, forgot password, reset password (`components/Auth.tsx`, `components/EmailVerification.tsx`). |
| Six single-digit boxes, paste fills all six. | A single numeric input accepting 6 to 10 digits. |
| Resend countdown ("Resend code in 0:42"). | A 60-second resend countdown exists. |
| Wrong code: "That code didn't match. Try again." | Wording differs; check `EmailVerification.tsx`. |

**Decision needed:** passwordless code sign-in (as designed) or email + password with OTP verification (as built, and as the owner originally requested when moving to Supabase).

## Onboarding

| Spec | Current app |
|------|-------------|
| Four steps: Verify email, Profile, Courses, Plan. Every non-essential field skippable. | Three steps: Personal Profile, Academic Context, Study Preferences (`components/Onboarding.tsx`). No course-seeding or plan step. |

## Navigation

| Spec | Current app |
|------|-------------|
| Desktop sidebar of six: Overview, Study Planner, Academic Studio, Private Circles, Resources, Settings. Mobile bottom bar of five: Home, Planner, Studio, Circles, Library. | Nine items in `App.tsx`: Dashboard, Academic Studio, Courses, Schedule, Study Hub, Circles, CGPA & Planner, Analytics, Study Timer. |

## Visual style

| Spec | Current app |
|------|-------------|
| Blue `#2563EB`, flat, one sans-serif family in two weights. | Inter is loaded, but headings use a serif face in several screens, and buttons and accents use indigo. |
| Logo placeholder in mockups; sample the exact blue from the original logo. | The real logo is in `public/` (`korsiq-logo.png`, `korsiq-logo-light.png`). The brain-and-cap mark was built with blue measured at approximately `#0A58F0`, which differs slightly from the spec's `#2563EB`. **Decision needed:** align the palette to the logo blue or the spec blue. |

## Plans and limits

| Spec | Current app |
|------|-------------|
| Free (₦0), Plus (₦7,500/month), Academic Studio (₦15,000/month). Limits are beta and unconfirmed. | Tiers are `free`, `scholar`, `sage` (`types.ts`). **Every new user is created as `scholar` with Pro on** (database default on `profiles`). |
| Upgrade is a real purchase. | The Academic Studio upgrade modal sets the tier to `scholar` on the client with **no payment**. The database now ignores client changes to `tier` and `is_pro`, so this button will not persist once tiers are enforced. |

**Decision needed:** map the three spec plans onto the tiers, set the default for new users, and decide the payment provider before any pricing page ships (also listed in `04`).

## Where AI credits live

The spec says AI credits appear **only** in Settings, never on the dashboard. Check any credit or usage display against this when it is added.

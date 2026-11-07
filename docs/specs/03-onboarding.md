# 03 Onboarding

Source: *KorsIQ Onboarding screens*. Four steps, shown at desktop (1280 px) and mobile (390 px). All data is sample content.

## Shared layout

- **Desktop:** split screen. Left panel (Light blue) holds the logo and the headline **"Study smarter. Stay organised. Produce better academic work."** Right panel holds the step content, centred.
- **Mobile:** logo bar on top, content below, no side panel.
- **Progress:** a three-segment bar labelled **Profile, Courses, Plan**, shown from step 2 onward. The verify step comes before it and has no progress bar.
- Every non-essential field is **skippable**. Skipping must keep the student moving and the dashboard prompts them to finish later.

---

## Step 1: Verify email

Email **code sign-in**. The email step is a single field and a `Send code` button. The code step is:

- Heading "Check your email". Text: "Enter the 6-digit code we sent to {email}."
- **Six single-digit boxes** on mobile and desktop. **Paste fills all six.**
- Helper line: "Resend code in 0:42 · Use a different email" (countdown, then Resend becomes available).
- One primary button `Verify`.

| Situation | Behaviour |
|-----------|-----------|
| Wrong code | "That code didn't match. Try again." |
| Expired code | Offers **Resend** |
| Repeated attempts | Shows a **wait time**, never a silent block |

---

## Step 2: Academic profile

Heading "Set up your profile". Subtext "Takes about a minute. You can change this later."

Fields, in order:

1. Full name
2. Institution (search your university)
3. Department or programme (select)
4. Level (select) and Semester (select), side by side
5. Grading scale: "5.0 scale, preselected from your institution"
6. Current CGPA (optional): "Leave blank to calculate later"

Actions: primary `Continue`, text link `Skip for now`.

- **Grading scale** is seeded from the institution (5.0 and 4.0 scales) and is changeable.
- **Mobile:** fields scroll; the Continue button stays reachable above the keyboard.

---

## Step 3: Add courses

Heading "Add your courses". Subtext "The ones you're taking this semester." Course management itself lives in **Study Planner**; this step only seeds it.

Fields: Course code (for example `CSC 201`), Credit units (for example `3`), Course title (for example `Data structures`), then `+ Add course`. An "Added so far" list shows each course as "CODE · Title" with its units.

Actions: primary `Continue`, text link `Skip for now`.

- **Empty state:** "Add the courses you're taking this semester." with the form open.
- **Remove:** each added course has a remove control with an **accessible name**.
- **Validation:** units are checked on entry, with the error **beside the field**.

---

## Step 4: Choose a plan

Heading "Pick how you want to start". Subtext "You can change your plan anytime in Settings." **Optional and non-blocking:** the student reaches the dashboard either way.

| Plan | Price | Line |
|------|-------|------|
| **Free** (preselected) | ₦0 | Get organised. Track your CGPA and plan your study time. |
| **Plus** | ₦7,500 / month | Study smarter. More AI help, storage and Lite Studio. |
| **Academic Studio** | ₦15,000 / month | Research, write and produce. Full Studio workspace. |

A `Compare all features` link sits under the cards. One primary button whose label follows the selection ("Continue with Free").

- **No numbers yet:** only names, confirmed prices and one line each. Plan limits stay out until the beta review.
- **Payment:** choosing a paid plan opens checkout. If payment fails, the student returns to this step **with Free kept**.

# KorsIQ UI Rebuild Log

This log tracks each phase of the KorsIQ UI rebuild to the design specifications in `docs/specs/`.

---

## Phase 0: Component Mapping and Architecture Audit

### 1. Spec Destination to Component Mapping

| Spec Destination | Primary Components | Notes & Sub-views |
| :--- | :--- | :--- |
| **1. Overview (Dashboard)** | `components/Dashboard.tsx`<br>`components/RecentFiles.tsx` | Greeting, Today's priorities, Upcoming deadlines, Study schedule, Course snapshot (Current CGPA, Target CGPA, course count), Recent documents. 2 columns on desktop (1280px), 1 column on mobile (390px). |
| **2. Study Planner** | `components/CourseManager.tsx`<br>`components/CGPACalculator.tsx`<br>`components/TimetableView.tsx`<br>`components/ScheduleView.tsx` | Unified container with tabs: **Courses**, **CGPA**, **Timetable**, **Revision** (Desktop). Mobile shortens to 3 tabs: Courses, CGPA, Timetable. Current, Target (0.00 until set), and Projected CGPA as separate cards. Deterministic calculation; "Explain my CGPA" AI button. |
| **3. Academic Studio** | `components/AcademicStudio.tsx`<br>`utils/docxExport.ts` | 3-column layout on desktop: Outline (left), Canvas (center), Brief & Sources (right). Top bar with Document title, Save state, Undo/Redo, Export. Mobile focused writing mode with bottom sheets (Outline, Sources, Cite, Versions). Citation chips point only to attached sources. Quiet upgrade prompts for plan gates. |
| **4. Private Circles** | `components/StudyGroups.tsx` | My circles with role (Owner, Member), Join with code, Invite code for owners/moderators (`KQ-XXXX-XX`) with Copy and Regenerate, Members list with roles and confirmed removal. |
| **5. Resources** | Dedicated Library view integrating:<br>`components/StudyHub.tsx` (file management & uploads)<br>`components/RecentFiles.tsx` | Search, filter chips (All, My files, Circles), storage meter (quota bar), file list table (Name, Owner, Size, Added, Status tag). Distinct upload error feedback. Largest-files list on quota warning. |
| **6. Settings** | `components/Profile.tsx`<br>New `PlanAndUsage` sub-view | Current plan, Storage meter, Upgrade card with single primary button ("See plans"). AI credits displayed only if real metering exists (otherwise omitted with no fake numbers). Profile & notification settings. |
| **Onboarding** | `components/EmailVerification.tsx`<br>`components/Onboarding.tsx` | 4-step flow: 1. Verify email (6 single-digit inputs, paste-all, 60s resend timer), 2. Academic profile (Name, University, Dept, Level/Semester, Grading scale, Target CGPA), 3. Add courses (seeded to real Supabase `courses` table), 4. Choose a plan (Free preselected, ₦0 / ₦7,500 / ₦15,000, non-blocking). Non-essential fields skippable. |

---

### 2. Displaced Features & Proposed Homes

The following existing features do not have a dedicated slot in the 6 main desktop navigation items:

1. **Study Hub AI Tools (`StudyHub.tsx` - Flashcards, Quiz Generator, Document Chat, Mindmaps, Audio Podcasts):**
   - *Status:* Preserved in full.
   - *Proposed Home:* Directly linked from **Resources** (selecting a file presents "Study Tools" / "Generate Flashcards & Quizzes") and from **Study Planner** ("Open Study Hub").
2. **Analytics (`AnalyticsView.tsx`):**
   - *Status:* Preserved in full.
   - *Proposed Home:* Reachable from **Study Planner** (via an "Analytics" tab or header action) and from the **Overview** Course snapshot.
3. **Study Timer / Pomodoro (`PomodoroTimer.tsx`):**
   - *Status:* Preserved in full.
   - *Proposed Home:* Reachable from **Overview** quick actions and **Study Planner** ("Start Session").
4. **Chat Assistant (`ScolarisChatWidget.tsx`):**
   - *Status:* Preserved in full as a floating assistant accessible across all workspace views for onboarded users.
5. **Admin Portal (`AdminDashboard.tsx`, `AdminLogin.tsx`):**
   - *Status:* Preserved in full. Reachable via `/admin` and via Settings.

---

### 3. Decisions & Open Questions Log

- **Decision 1 (Auth):** Keeping email + password with 6-digit OTP email verification. Six single-digit boxes with paste support, 60s resend countdown.
- **Decision 2 (Brand Color):** Primary blue `#2563EB` set as the design token in `index.html`. Logo uses `components/KorsIQLogo.tsx`.
- **Decision 3 (Status Colors):** Provisional tokens configured for success, warning, error, marked `TODO(confirm status colours)`. Always paired with icon and words.
- **Decision 4 (Plans & Payments):** Displaying Free (₦0), Plus (₦7,500/mo), Academic Studio (₦15,000/mo). Selecting paid triggers non-blocking "Available soon" modal and preserves Free. No checkout.
- **Decision 5 (Plan Limits):** Beta constants placed in `constants.tsx` with `// BETA` marker. No final hardcoding.

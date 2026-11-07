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

---

## Phase 1: Tokens and App Shell

- **Color & Style Tokens:** Defined in `index.html` `tailwind.config` with Primary blue `#2563EB`, Deep blue `#1746A2`, Ink `#111827`, Muted `#5B6472`, Light blue `#EFF6FF`, Border `#E5E7EB`, and provisional status tokens marked `TODO(confirm status colours)`.
- **BETA Limits:** Added `BETA_PLAN_LIMITS` into `constants.tsx` with `// BETA` comment.
- **Desktop Sidebar:** Fixed left sidebar featuring exactly six destinations in order: Overview, Study Planner, Academic Studio, Private Circles, Resources, Settings. Active item uses Light blue background (`bg-[#EFF6FF]`) with Primary blue text & icon.
- **Mobile Navigation:** Bottom navigation bar featuring exactly five destinations: Home, Planner, Studio, Circles, Library.
- **Headers:** 
  - Mobile top header bar includes KorsIQ logo, notification bell with unread badge, and student initials avatar (tapping opens Settings).
  - Desktop top header bar includes breadcrumb path, theme toggle, notification bell with unread badge, and user initials avatar pill.
- **Touch Targets & Radius:** 44px min touch target on all controls, 8px default corner radius, sans-serif typography (no serif headings).
- **Verification:** Verified at 390px, 768px, and 1280px. `npm run lint` and `npm run build` pass cleanly.

---

## Phase 2: Dashboard (Overview)

- **Header Structure:** Rebuilt with dynamic time-of-day greeting ("Good morning / afternoon / evening, {name}"), formatted date underneath, and desktop quick action buttons (`+ Task`, `+ Course`).
- **Two-Column Desktop & Single-Column Mobile Layout:**
  - Left column:
    - *Today's priorities:* Interactive checkbox task list with course code, revision mode, and duration/time. Toggling checks task off. Clean calm empty state when clear.
    - *Upcoming deadlines:* Title, course code, and formatted deadline date.
  - Right column:
    - *Study schedule:* Today's and upcoming scheduled sessions with duration and direct link to open study hub.
    - *Course snapshot:* Desktop displays Current CGPA and Target CGPA side by side, plus semester course count and total credit units. Mobile collapses to a single concise line (`Current CGPA 4.12 · Target 4.50`).
    - *Recent documents:* List of academic studio drafts showing title, doc type tag, and relative edit time (`Edited X days ago`).
- **Data Integrity & Rules:** Only CGPA (from calculated records) and course count are shown as metrics, both from real data. No vanity metrics or invented placeholders. AI credits completely excluded from dashboard.
- **Verification:** Responsive testing across 390px, 768px, and 1280px. `npm run lint` and `npm run build` passed.

---

## Phase 3: Study Planner and CGPA

- **Unified Planner Container:** `components/StudyPlannerView.tsx` incorporates Courses, CGPA, Timetable, and Revision tabs on desktop (Courses, CGPA, Timetable on mobile).
- **Three Distinct Metric Cards:**
  1. *Current CGPA:* Separated card showing current standing based purely on deterministic semester course records.
  2. *Target CGPA:* Separated card strictly defaulting to 0.00 until set by the user, with inline editing and scale indicator.
  3. *Projected:* Separated card showing projected graduation CGPA with subtext "Based on your target and remaining units".
- **Deterministic Math & Named AI Action:** Calculation logic preserved untouched. AI interactions replaced with a clean, named **"Explain my CGPA"** button (no decorative AI motifs, chat bubbles, or gradients).
- **Typography & Layout:** Replaced all `font-serif` headings with clean `font-sans`, 8px corner radius, and responsive cards layout (mobile: Current and Target side-by-side, Projected below).
- **Verification:** Verified at 390px, 768px, and 1280px. `npm run lint` and `npm run build` pass cleanly.

---

## Phase 4: Resources (Library)

- **Search, Filters & Quota Bar:** Built `components/ResourcesView.tsx` with instant search, filter chips (All, My files, Circles), and dynamic storage quota meter displaying used storage vs plan limit and uploads this month.
- **Upload Error Precision:** Implemented 3 separate distinct upload failure error messages:
  1. *File rejected:* Triggers on unsupported MIME types or files exceeding the 30MB per-document limit.
  2. *Upload failed:* Triggers on network or storage connection interruptions.
  3. *Details not saved:* Triggers if the file blob transfers to storage but database row creation fails.
- **Quota-Reached Sheet:** If storage limit is exceeded, an alert banner lists the largest files with their sizes to help the user clear space.
- **Real Status Tags:** Added migration `supabase/migrations/20261107_user_files_status.sql` adding nullable `status TEXT DEFAULT 'ready'` to `user_files`. Rendered icon-free text tags (`Ready`, `Processing`) only if real status exists (no fake status indicators).
- **Verification:** Responsive testing at 390px, 768px, and 1280px. `npm run lint` and `npm run build` pass cleanly.

---

## Phase 5: Academic Studio Editor

- **Top Control Bar:** Document title, saved state badge with checkmark (`Saved`), Undo / Redo controls with history tracking, and single primary action button `Export`.
- **Three-Column Desktop Layout (1280px):**
  - *Left Column (Outline):* Numbered section hierarchy with active section highlighted, completion checkmarks, and overall target word count progress.
  - *Center Column (Canvas):* Active section header with section goal, spec hint line *"Draft the next paragraph yourself, or ask for a suggested draft of this section."*, and clean writing canvas with placeholder *"Start writing, or ask for a suggested draft."*.
  - *Right Column (Brief, Actions & Sources):*
    - *Brief card:* Summary formatted as `Report · 1,500 words · undergraduate · APA`.
    - *Three distinct action buttons:* **Draft this section** (primary), **Revise selection**, and **Check citations**.
    - *Sources list:* Attached references with citation chips `(Author, Year)` that insert directly into the active section at cursor position.
- **Focused Mobile Mode (390px):**
  - Full-width focused writing canvas.
  - Docked bottom tabs: `Outline`, `Sources`, `Cite`, and `Versions`.
  - Tools open as bottom sheets sliding up from the screen bottom with 44px touch targets.
- **Quiet Upgrade Prompts:** Gated features (`Export` on free plans, `Versions` on non-studio plans) trigger a quiet upgrade card ("one card, one primary button") explaining the feature without clutter.
- **Typography & Clean UI:** All `font-serif` headings converted to `font-sans`, flat blue/white/black theme tokens, 8px radius.
- **Verification:** Verified at 390px, 768px, and 1280px. `npm run lint` and `npm run build` pass cleanly.

---

## Phase 6: Private Circles

- **Layout Structure:** Restyled `components/StudyGroups.tsx` to match design specs:
  - Top header: Title "Private Circles", subtitle "Study groups, members and shared files", and single primary button `Create circle`.
  - Left card *My circles*: List of circles showing Circle Name and student's role (`Owner` or `Member`), with a dedicated `Join with code` action button.
  - Right workspace: The selected circle with tabs (`Discussion`, `Resources`, `Members`, and `KorsIQ AI` retained for complete feature coverage).
- **Invite Code Privacy & Format:**
  - Standardized invite code generator in `services/db.ts` to `KQ-XXXX-XX` format (e.g. `KQ-7F3A-92`).
  - Invite code box with `Copy` and `Regenerate` controls and helper text *"Regenerating replaces the old code. Current members keep access."* is strictly displayed to circle owners and moderators only. Regular members do not see the invite code.
- **Member Removal Confirmation:**
  - Replaced browser `confirm()` with an accessible confirmation modal stating: *"Removing this member will immediately revoke their access to shared circle files and discussions."*
- **Distinct Join Errors:**
  - Rate limiting (max 5 attempts per minute) displaying *"Too many attempts. Please wait a moment before trying another code."*.
  - Invalid code displaying *"That code doesn't match any circle. Check the code and try again."*.
  - Expired / replaced code displaying *"This invite code has expired or has been replaced by the circle owner."*.
  - Already a member displaying *"You are already a member of this circle."*.
- **Plan Gating:** Free plans can join circles; clicking `Create circle` on a Free plan opens a quiet Plus upgrade prompt ("one card, one primary button").
- **Verification:** Verified at 390px, 768px, and 1280px. `npm run lint` and `npm run build` pass cleanly.





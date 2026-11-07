# Rebuild prompt for Antigravity (agy)

Copy everything below the line into agy as the task. It assumes `AGENTS.md` and `docs/specs/` are in the repo. Edit the **Defaults** section if you decide differently; agents will follow it exactly.

---

## TASK

You are rebuilding the KorsIQ user interface to match the design specs in this repository, **without changing how the app works underneath** (authentication, Supabase calls, `services/db.ts`, the Express `/api` routes and their security).

### 1. Read first (do not skip)
1. `AGENTS.md`
2. `docs/specs/README.md`, then `01-design-system.md`, `02-screens.md`, `03-onboarding.md`, `04-handoff-and-open-questions.md`
3. `docs/specs/05-current-app-gap-notes.md`
4. The original PDFs in `docs/specs/source/` for visual detail

### 2. Non-negotiable
- Keep every existing feature working. This is a UI restructure, not a rewrite of logic.
- Follow every rule in `AGENTS.md`, especially: no secrets in the browser, no weakening RLS, no fake content, work on a branch, never push to `main`.
- Obey the design rules: blue, white and black; flat; **no gradients; no decorative AI motifs**; one sans-serif family in two weights; 8 px corners; 44 px touch targets; **one primary button per screen**; status always uses an icon plus words; AI credits only in Settings.
- Use the real logo via `components/KorsIQLogo.tsx`. The "logo here" boxes in the mockups are placeholders.

### 3. Defaults for open decisions (owner may override by editing this section)
1. **Auth:** keep the current email + password sign-in with a one-time code to verify the email. Do **not** build passwordless sign-in. Restyle the code entry as six single-digit boxes where paste fills all six, with the resend countdown and the error messages from `03-onboarding.md`.
2. **Primary blue:** `#2563EB` from the spec. Define all colours once as Tailwind theme tokens in the `tailwind.config` in `index.html` so they can be changed in one place.
3. **Status colours** are unconfirmed. Use provisional tokens for success, warning and error, each marked `TODO(confirm status colours)`, and always pair them with an icon and words.
4. **Plans and payments:** do not change tier logic, database defaults or payments. Show the three plan names and prices from the spec; selecting a paid plan shows a non-blocking "Available soon" message and keeps Free selected. Do not build checkout.
5. **Limits:** plan limits are beta. Keep any allowance (storage, credits) in a single constants file with a `// BETA` comment. Never present a limit as final.

### 4. Phases
Work in order. After each phase: run `npm run lint` and `npm run build`, check the screens at **390 px, 768 px and 1280 px** wide, and make one commit. If a phase is blocked, write the reason in `docs/specs/rebuild-log.md` and move on.

**Phase 0: Audit (no code changes).** Map each spec screen to the existing components. Suggested mapping, verify it: Overview = `Dashboard`; Study Planner = `CourseManager` + `CGPACalculator` + `TimetableView`/`ScheduleView` (tabs: Courses, CGPA, Timetable, Revision); Academic Studio = `AcademicStudio`; Private Circles = `StudyGroups`; Resources = the file library (`StudyHub` files and `RecentFiles`); Settings = `Profile` plus a new Plan and usage view. Write the mapping, and any feature that has no home in the six destinations (Analytics, Study Timer, Study Hub), to `docs/specs/rebuild-log.md`. Decide where those live without deleting them.

**Phase 1: Tokens and app shell.** Add the colour, type and radius tokens. Build the shell: desktop fixed sidebar with exactly six destinations (Overview, Study Planner, Academic Studio, Private Circles, Resources, Settings); mobile bottom bar with five (Home, Planner, Studio, Circles, Library); header with bell and initials avatar. Remove gradients and serif headings. *Done when:* every existing view is still reachable and no horizontal scroll at 390 px.

**Phase 2: Dashboard.** Greeting, today's priorities, upcoming deadlines, study schedule, course snapshot, recent documents. Only CGPA and course count as metrics, from real data. Two columns on desktop, one on mobile.

**Phase 3: Study Planner and CGPA.** Tabs Courses, CGPA, Timetable, Revision (three on mobile). Show Current, Target and Projected as separate cards. Keep the CGPA calculation deterministic and unchanged; AI only explains, through a named "Explain my CGPA" button. Target shows 0.00 until set.

**Phase 4: Resources.** Search, filter chips (All, My files, Circles), storage meter, file list with owner, size and date. Show a Ready or Processing tag **only if a real status exists**; if not, add a nullable status via a new migration or omit the tag. Never fake it. Separate messages for upload failed, details not saved, and file rejected. Quota-reached sheet lists the largest files.

**Phase 5: Academic Studio editor.** Restyle to the three-column desktop layout (outline, canvas, brief and sources) with a top bar (title, save state, undo and redo, export), and the mobile focused mode with bottom sheets. Citation chips point only to attached sources. Keep the existing generation logic; gate Versions and Export with a quiet upgrade prompt where the plan excludes them.

**Phase 6: Private Circles.** My circles list with roles, invite code (owners and moderators only) with Copy and Regenerate, members list, and a confirm dialog before removing a member that says shared-file access ends. Show distinct messages for invalid, expired, replaced and rate-limited codes **only where the backend can tell them apart**; list the gaps in `rebuild-log.md` instead of faking them.

**Phase 7: Onboarding.** Follow `03-onboarding.md`: verify email, profile, courses, plan. Every non-essential field skippable. Seed courses into the real courses table, not local state only.

**Phase 8: Plan and usage (Settings).** Current plan, storage meter, upgrade card with one primary button. Show the AI credits card **only if real usage metering exists**; if not, omit it and note the gap. Never display invented credit numbers.

**Phase 9: Polish and QA.** Real empty and loading states on every screen. Check the accessibility list in `04-handoff-and-open-questions.md`: no horizontal overflow, visible keyboard focus, accessible names on icon-only buttons, errors beside fields, contrast on final hex values.

### 5. Finish
Open a pull request from your branch (not `main`) and end with a report: what changed per phase, what you skipped and why, every "Decision needed" you hit, and the exact checks you ran.

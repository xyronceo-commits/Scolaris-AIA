# KorsIQ UI Cleanup Log (Phase 0)

Source: `AGENTS.md`, `docs/specs/01-design-system.md`, and clean UI principles.
Branch: `chore/ui-cleanup`

## 1. Principles & Objectives
- **Plain, calm interface**: Less decoration, fewer words. Every icon and sentence must earn its place.
- **Remove decorative AI icons**: Sparkles, Wand2, WandSparkles, Bot, Brain, BrainCircuit, Zap, Stars. Replace with plain text, functional icons (Upload, Download, Calendar, Trash, Check), or plain loading spinners.
- **Eliminate floating elements**: Delete unmounted `ScolarisChatWidget.tsx` and unused `AnalyticsView.tsx`. Relocate floating theme toggle in `Auth.tsx` and `EmailVerification.tsx` into normal document flow.
- **Ruthless wording cleanup**: Remove marketing hype words ("Smart", "Magic", "AI-powered", "Instantly", "Unlimited", "Boost", "Unlock", "Supercharge", "Intelligent"). Use plain verbs.
- **Replace uppercase micro-labels**: Normal sentence-case labels at standard body/caption size instead of `tracking-widest` / `tracking-wider`.
- **Single source of truth for Plans & Credits**: Free: 20 credits, 500 MB; Plus: 150 credits, 2 GB; Studio (Premium): 200 credits, 10 GB.
- **Visual noise removal**: Eliminate gradients (`bg-gradient-to-...`), bounce/pulse animations, and stacked shadows.

---

## 2. Open Decisions & Confirmations

| # | Item | Status / Resolution |
|---|------|---------------------|
| 1 | **Unused Components** | Confirmed: `components/ScolarisChatWidget.tsx` is not mounted anywhere. `components/AnalyticsView.tsx` is not imported anywhere in the codebase. Both are slated for deletion. |
| 2 | **Plan Credits Inconsistency** | `Onboarding.tsx:568` stated "1,000 AI credits", while `Profile.tsx`, `SubscriptionCheckoutModal.tsx`, `lib/aiCredits.ts`, and Supabase migration `20261110_ai_credit_ledger_and_rpc.sql` define: Free = 20, Plus = 150, Studio = 200. **Resolution**: Create unified `lib/plans.ts` exporting `PLANS_CONFIG` and consume it in Onboarding, Settings, and Checkout. |
| 3 | **Floating Theme Toggle** | Currently floating fixed at `top-4 right-4` in `Auth.tsx` and `EmailVerification.tsx`. **Resolution**: Move into top layout navigation/header bar in normal document flow. |
| 4 | **Emoji in UI Text** | `TaskModal.tsx:98-102` contains decorative emoji (`📝`, `🎓`, `📌`, `✅`). **Resolution**: Replace with clean functional text / SVG icons. |
| 5 | **Allowlisted Icons** | No AI-themed icons remain in student-facing components. Functional icons (`Upload`, `Calendar`, `Clock`, `BookOpen`, `Award`, `FileText`, `CheckCircle2`, `Trash2`, `Loader2`) are retained. |

---

## 3. Comprehensive Removal & Modification Table

| File & Line | Current Element / Text | Category | Action Taken | Rationale |
|---|---|---|---|---|
| `index.html:6` | `KorsIQ — AI-Powered Study & Academic Workspace` | Page Title | Replace with `KorsIQ - Outsmart Your Syllabus.` | Spec rule: Clean, unhyped branding tagline. |
| `App.tsx:276` | `document.title = 'KorsIQ — AI-Powered Study & Academic Workspace'` | Page Title | Replace with `document.title = 'KorsIQ - Outsmart Your Syllabus.'` | Align document title to brand tagline. |
| `App.tsx:690` | `animate-bounce shadow-xl` on offline warning | Visual Noise | Remove `animate-bounce` and reduce to `shadow-sm` | Eliminates distracting animation. |
| `App.tsx:1141` | `text-xs font-semibold uppercase tracking-wider text-[#111827]` | Micro-label | Change to `text-xs font-semibold text-[#111827]` | Plain sentence case without excessive letter spacing. |
| `components/RecentFiles.tsx:16` | `Sparkles` import | AI Icon | Remove import | Remove decorative AI icon. |
| `components/RecentFiles.tsx:310-313` | `<Sparkles size={10} /> Recent` pill | Badge / AI Icon | Remove the whole "Recent" pill badge | Redundant pill; upload timestamp is already shown. |
| `components/UserAvatar.tsx:6,7,13` | `Brain`, `Sparkles`, `Zap` imports | AI Icon | Replace avatar options with academic icons (`Target`, `Bookmark`, `Compass`) | Remove AI motifs from student avatar picker. |
| `components/UserAvatar.tsx:40-52` | `brain`, `sparkles` avatar options | AI Icon | Replace with `target` and `bookmark` | Plain, calm avatar options. |
| `components/CGPACalculator.tsx:4,7` | `Sparkles`, `Brain` imports | AI Icon | Remove imports | AI-style icon removal. |
| `components/CGPACalculator.tsx:32` | `icon: Brain` in navigation tabs | AI Icon | Replace with `BookMarked` or remove | Functional recognition icon. |
| `components/CGPACalculator.tsx:602` | `Smart Academic Study Schedule` | Marketing Word | Replace with `Academic Study Schedule` | Banned word "Smart". |
| `components/CGPACalculator.tsx:713-714` | `KorsIQ Smart Reminders Active... receive smart reminders` | Marketing Word | Change to `KorsIQ Reminders Active... receive reminders` | Banned word "Smart". |
| `components/CGPACalculator.tsx:742` | `Intelligent academic forecasting, personalized study schedules...` | Marketing Word | Shorten to `Forecast CGPA and plan your study schedule.` | Remove "Intelligent" and fluff subtitle. |
| `components/CGPACalculator.tsx:772` | `<Sparkles size={13} /> <span>AI Reasoning</span>` | AI Icon | Change to `<span>Reasoning</span>` | Plain text button without Sparkles. |
| `components/CGPACalculator.tsx:790` | `<Brain size={13} /> <span>Techniques</span>` | AI Icon | Change to `<BookMarked size={13} /> <span>Study Methods</span>` | Functional icon, plain phrasing. |
| `components/CGPACalculator.tsx:819` | `bg-gradient-to-r from-blue-50 to-indigo-50...` | Gradient | Replace with `bg-[#EFF6FF] dark:bg-blue-950/40 border border-[#E5E7EB]` | Flat card design per 01-design-system. |
| `components/CGPACalculator.tsx:1014` | `Set your Target CGPA to unlock full academic reasoning` | Marketing Word | Replace with `Set your Target CGPA to view academic reasoning` | Banned word "unlock". |
| `components/CGPACalculator.tsx:1030` | `<Sparkles size={14} className={isAnalyzing ? 'animate-spin' : ''} />` | AI Icon | Replace with `<Loader2 size={14} className="animate-spin" />` when analyzing, else no icon | Clean loading state without Sparkles. |
| `components/CGPACalculator.tsx:1077` | `<Upload size={14} className={isUploadingTranscript ? 'animate-bounce' : ''} />` | Visual Noise | Remove `animate-bounce` | No bounce animations. |
| `components/CGPACalculator.tsx:1308` | `<Sparkles size={24} className="text-blue-600 mx-auto" />` | AI Icon | Replace with `<FileText size={24} className="text-slate-400 mx-auto" />` | Functional empty-state icon. |
| `components/CGPACalculator.tsx:1318` | `<Sparkles size={13} className={isAnalyzing ? 'animate-spin' : ''} />` | AI Icon | Replace with `<Loader2 size={13} className="animate-spin" />` or plain text | Clean loading state. |
| `components/CGPACalculator.tsx:1371` | `<Sparkles size={13} /> <span>Generate Weekly Schedule</span>` | AI Icon | Replace with `<Calendar size={13} /> <span>Generate Weekly Schedule</span>` | Functional icon. |
| `components/CGPACalculator.tsx:1535` | `<Sparkles size={16} />` in Mentor header | AI Icon | Replace with `<MessageSquare size={16} />` | Functional chat icon. |
| `components/CGPACalculator.tsx:1543` | `w-2 h-2 rounded-full bg-emerald-500 animate-pulse` | Visual Noise | Remove `animate-pulse` | Subtle static dot indicator. |
| `components/CGPACalculator.tsx:1573` | `<Sparkles size={13} className="animate-spin text-blue-600" />` | AI Icon | Replace with `<Loader2 size={13} className="animate-spin text-blue-600" />` | Standard spinner. |
| `components/CGPACalculator.tsx:1625,1630` | `Smart Notifications` | Marketing Word | Rename to `Reminders` | Banned marketing word. |
| `components/CGPACalculator.tsx:1632` | `...and configure smart reminders so you never miss a revision session.` | Marketing Word | Change to `...and set study reminders.` | Ruthless wording reduction. |
| `components/CGPACalculator.tsx:1713` | `Smart Study Notifications` | Marketing Word | Rename to `Study Reminders` | Plain naming. |
| `components/CGPACalculator.tsx` (10 instances) | `tracking-wider`, `tracking-widest` uppercase micro-labels | Micro-labels | Convert to normal sentence-case text | Calm typography per spec. |
| `components/CourseManager.tsx:10` | `Sparkles` import | AI Icon | Remove import | AI icon cleanup. |
| `components/CourseManager.tsx:241-242` | `<Sparkles size={13.5} className="animate-pulse..." /> <span>Magic Import</span>` | AI Icon / Wording | Replace with `<Upload size={13.5} /> <span>Import syllabus</span>` | Functional icon, remove "Magic". |
| `components/CourseManager.tsx:419-420` | `<Sparkles size={15} /> AI Syllabus Importer` | AI Icon | Replace with `<Upload size={15} /> Syllabus Importer` | Functional icon. |
| `components/CourseManager.tsx:500` | `<Sparkles size={14} /> <span>Extract & Save</span>` | AI Icon | Replace with plain text `<span>Extract and save</span>` | Plain button. |
| `components/PomodoroTimer.tsx:3,93` | `Sparkles` import & `<Sparkles size={12} /> Focus Session` | AI Icon / Badge | Remove Sparkles and unneeded decorative badge | Pill carries no extra information. |
| `components/TimetableView.tsx:3,104` | `Sparkles` import & `<Sparkles size={16} />` | AI Icon | Replace with `<Clock size={16} />` | Functional time icon. |
| `components/ScheduleView.tsx:6,11` | `Brain`, `Sparkles` imports | AI Icon | Remove imports | AI icon cleanup. |
| `components/ScheduleView.tsx:32` | `icon: Brain` in Deep Dive session mode | AI Icon | Replace with `BookOpen` | Functional academic icon. |
| `components/ScheduleView.tsx` (8 instances) | `tracking-wider` / `tracking-widest` micro-labels | Micro-labels | Convert to sentence case | Typography cleanup. |
| `components/SemesterSchedulePlanner.tsx:40,413` | `Sparkles` import & `<Sparkles size={16} /> Re-Generate Reading Schedule` | AI Icon | Replace with `<RefreshCw size={15} /> Regenerate reading schedule` | Functional action icon. |
| `components/StudyHub.tsx:5` | `Sparkles` import | AI Icon | Remove import | AI icon cleanup. |
| `components/StudyHub.tsx:1179` | `{ICONS.Sparkles}` in synthesis loader | AI Icon | Remove nested Sparkles; use clean single spinner | Plain loading indicator. |
| `components/StudyHub.tsx:1197` | `<Sparkles size={28} />` in empty state | AI Icon | Replace with `<FileText size={28} />` | Functional empty-state icon. |
| `components/StudyHub.tsx:2171` | `<Sparkles size={14} />` in callout banner | AI Icon | Replace with `<FileText size={14} />` | Functional icon. |
| `components/StudyHub.tsx:777` | `AI Podcast` | Wording | Rename to `Audio summary` / `Podcast` | Plain wording. |
| `components/StudyHub.tsx:986` | `animate-pulse` on dropzone container | Visual Noise | Remove `animate-pulse` | Reduce visual distraction. |
| `components/StudyHub.tsx:1221,1239,1968,1982,1996,2015` | Action credit labels (e.g. `Regenerate — 1 credit`, `AI Podcast — 6 credits`) | Credits Format | Format consistently as `"Action, X credits"` (e.g. `Generate summary, 1 credit`, `Audio summary, 6 credits`) | Rule 4 compliance. |
| `components/StudyHub.tsx` (~18 instances) | `tracking-widest` / `tracking-wider` micro-labels | Micro-labels | Convert to normal sentence-case labels | Typography cleanup. |
| `components/ResourcesView.tsx:12,477,554` | `BrainCircuit` import & icons on Study Tools action | AI Icon | Replace with `<BookOpen size={16} />` | Functional study icon. |
| `components/ResourcesView.tsx:412` | `uppercase tracking-wider text-[10px]` on table headers | Micro-labels | Convert to standard table caption typography | Clean typography. |
| `components/StudyGroups.tsx:598` | `text-[10px] font-bold uppercase tracking-widest` | Micro-labels | Convert to `text-xs font-semibold` sentence case | Clean typography. |
| `components/AcademicStudio.tsx:6,23,38` | `BookOpen as Sparkles`, `Edit3 as Wand2`, `Zap` imports | AI Icon | Remove aliases & unused `Zap` | Remove AI icon aliases. |
| `components/AcademicStudio.tsx:1013` | `<Sparkles size={12} /> Academic Studio` pill | AI Icon / Badge | Remove Sparkles, simplify header | Clean header. |
| `components/AcademicStudio.tsx:1645` | `<Wand2 size={14} /> Write Section — 3 credits` | AI Icon / Credits | Change to `Write section, 3 credits` without Wand2 | Rule 1 & Rule 4. |
| `components/AcademicStudio.tsx:2204` | `<Wand2 size={14} /> Generate Outline — 2 credits` | AI Icon / Credits | Change to `Generate outline, 2 credits` without Wand2 | Rule 1 & Rule 4. |
| `components/AcademicStudio.tsx:2449` | `Unlock KorsIQ Academic Studio` | Marketing Word | Change to `Upgrade to Academic Studio` | Remove "Unlock". |
| `components/AcademicStudio.tsx` (~32 instances) | `tracking-wider` / `tracking-widest` uppercase micro-labels | Micro-labels | Convert to sentence case at standard size | Clean typography. |
| `components/Profile.tsx:848` | `Unlimited courses & timetable` | Marketing Word | Replace with `All courses & timetable` | Remove "Unlimited". |
| `components/Profile.tsx` (~9 instances) | `tracking-wider` uppercase micro-labels | Micro-labels | Convert to sentence case | Clean typography. |
| `components/SubscriptionCheckoutModal.tsx:299,355` | `tracking-wider` uppercase micro-labels | Micro-labels | Convert to sentence case | Clean typography. |
| `components/SubscriptionCheckoutModal.tsx:309` | `...unlimited courses` | Marketing Word | Replace with `...all courses` | Remove "Unlimited". |
| `components/Onboarding.tsx:484` | `tracking-wider` | Micro-labels | Remove `tracking-wider` | Clean typography. |
| `components/Onboarding.tsx:499` | `Unlimited courses and timetable` | Marketing Word | Replace with `All courses and timetable` | Remove "Unlimited". |
| `components/Onboarding.tsx:568` | `1,000 AI credits, 10 GB storage` | Inconsistent Plan | Replace with `200 monthly AI credits, 10 GB storage` | Align with unified plan configuration. |
| `components/Auth.tsx:396` | `fixed top-4 right-4...` floating theme toggle | Floating Element | Relocate to top auth card / page layout flow | Rule 2: No floating widgets over forms. |
| `components/Auth.tsx` (10 instances) | `tracking-wider` uppercase micro-labels | Micro-labels | Convert to sentence case at standard size | Clean typography. |
| `components/EmailVerification.tsx:253` | `fixed top-4 right-4...` floating theme toggle | Floating Element | Relocate to top card / page layout flow | Rule 2: No floating widgets over forms. |
| `components/TaskModal.tsx:98-102` | Emojis `📝`, `🎓`, `📌`, `✅` | Emoji Decoration | Remove emojis; use plain labels or SVG icons | Rule 1: Remove emoji decoration. |
| `components/Tutorial.tsx:3,34` | `Sparkles`, `BrainCircuit` imports & `<BrainCircuit size={28} />` | AI Icon | Replace with `<BookOpen size={28} className="text-blue-600" />` | Functional icon. |
| `components/Tutorial.tsx:20` | `Smart Course & Syllabus Import` | Marketing Word | Rename to `Course & Syllabus Import` | Remove "Smart". |
| `components/Tutorial.tsx:66` | `uppercase tracking-wider text-slate-600` | Micro-label | Convert to sentence case | Clean typography. |
| `components/ScolarisChatWidget.tsx` | Entire file (349 lines) | Floating Widget / Dead Code | Delete file | Rule 2: Unmounted floating widget. |
| `components/AnalyticsView.tsx` | Entire file (698 lines) | Dead Code | Delete file | Rule 2: Unused component. |

---

## 4. Execution Plan (One Commit Per Screen)

1. **Commit 1: Shared Plan Config & Utilities**
   - Create `lib/plans.ts` (single source of truth for Free, Plus, Studio plans, allowances, storage, and prices).
2. **Commit 2: Dashboard**
   - Clean up `components/RecentFiles.tsx` and `components/UserAvatar.tsx`.
3. **Commit 3: Study Planner**
   - Clean up `components/CGPACalculator.tsx`, `components/CourseManager.tsx`, `components/TimetableView.tsx`, `components/ScheduleView.tsx`, `components/SemesterSchedulePlanner.tsx`, `components/PomodoroTimer.tsx`.
4. **Commit 4: Study Hub**
   - Clean up `components/StudyHub.tsx` and `components/StudyHubAIChat.tsx`.
5. **Commit 5: Resources**
   - Clean up `components/ResourcesView.tsx`.
6. **Commit 6: Circles**
   - Clean up `components/StudyGroups.tsx`.
7. **Commit 7: Academic Studio**
   - Clean up `components/AcademicStudio.tsx`.
8. **Commit 8: Settings & Plans**
   - Clean up `components/Profile.tsx` and `components/SubscriptionCheckoutModal.tsx` using `lib/plans.ts`.
9. **Commit 9: Onboarding**
   - Clean up `components/Onboarding.tsx` using `lib/plans.ts`.
10. **Commit 10: Auth & Landing**
    - Clean up `components/Auth.tsx` and `components/EmailVerification.tsx` (relocate floating theme toggle, remove micro-labels).
11. **Commit 11: Shell, App Titles, Task Modal & Dead Files Deletion**
    - Update `App.tsx`, `index.html`, `components/Tutorial.tsx`, `components/TaskModal.tsx`.
    - Delete `components/ScolarisChatWidget.tsx` and `components/AnalyticsView.tsx`.

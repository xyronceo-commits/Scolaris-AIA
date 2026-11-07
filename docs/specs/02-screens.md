# 02 Screens

Source: *KorsIQ High-fidelity screens*, screens 1 to 6. Each screen is specified at desktop (1280 px) and mobile (390 px). All data shown is sample content.

---

## 1. Dashboard (Overview)

**Purpose:** the next useful action is visible without scrolling.

**Content order:** greeting, today's priorities, upcoming deadlines, study schedule, course snapshot, recent documents.

**Desktop**
- Header: "Good morning, {name}" with the date underneath; actions `+ Task`, `+ Course`, bell, avatar.
- Two columns. Left: *Today's priorities* (checkbox list with due or duration on the right), *Upcoming deadlines* (title and date). Right: *Study schedule*, *Course snapshot* (Current CGPA and Target CGPA side by side, plus "5 courses this semester"), *Recent documents* (title and "Edited 2 days ago").

**Mobile**
- Single column in the same order. Quick actions live in the header menu of each section. The course snapshot collapses to one line ("Current CGPA 4.12 · Target 4.50").

**Rules:** only CGPA and course count are shown as metrics, both from real data.

---

## 2. Study Planner and CGPA

**Purpose:** three separate figures. The CGPA calculation is **deterministic; AI only explains it.**

**Desktop**
- Title "Study Planner", subtitle "Courses, CGPA, timetable and revision". Primary button `+ Add course result`.
- Tabs: Courses, **CGPA**, Timetable, Revision.
- Three cards: *Current CGPA*, *Target CGPA*, *Projected* ("Based on your target and remaining units").
- A semester table (for example "First semester, 2025/26") with columns Code, Course, Units, Grade.

**Mobile**
- Tabs shortened to three: Courses, CGPA, Timetable. Revision opens from the plan.
- Current and Target side by side, Projected below, semester list ("CSC 201 · 3 units  A"), and one primary button **Explain my CGPA**.

**Rules**
- Current, target and projected values **never share a card or a label.**
- Target CGPA shows **0.00** until the student sets one.
- AI action is a named button, not a chat bubble; cost appears only on heavy actions.

---

## 3. Resources

**Purpose:** library with storage use, owner, size, date and processing status.

**Desktop**
- Title "Resources", subtitle "Personal files, course materials and shared files". Primary button `Upload file`.
- Search box and filter chips: All, My files, Circles.
- Quota bar ("1.1 GB of 2 GB used", "12 uploads this month").
- Table: Name, Owner ("You" or a circle name), Size, Added, Status.

**Mobile**
- Search, filter chips, quota card, list of files with status on the right, and a primary `Upload file` button.

**Rules**
- **Status uses icon-free text tags** (Ready, Processing) so colour is never the only signal.
- Quota: the normal state is shown; the full-quota banner reuses the alert style and lists the largest files.
- **Upload failures have separate messages** for: upload failed, details not saved, file rejected.

---

## 4. Academic Studio editor

**Purpose:** student-controlled drafting: approved outline, one section at a time.

**Desktop** (three columns)
- Top bar: document title, save state ("Saved"), Undo · Redo, `Export`.
- Left: outline (numbered sections, active section highlighted).
- Centre: the writing canvas with the active section heading and text. A hint line: "Draft the next paragraph yourself, or ask for a suggested draft of this section."
- Right: *Brief* (type, word count, level, citation style, for example "Report · 1,500 words · undergraduate · APA") and *Sources* (attached files), then three action buttons: **Draft this section**, **Revise selection**, **Check citations**.

**Mobile**
- Focused writing mode. Bottom tabs: Outline, Sources, Cite, Versions. Tools open as **bottom sheets**. Empty canvas hint: "Start writing, or ask for a suggested draft."

**Rules**
- **Citations are chips that point to attached sources only. Never invent references.**
- **Plan gating:** Versions and Export show a quiet upgrade prompt where not included in the student's plan.

---

## 5. Private Circles

**Purpose:** invite codes, roles and revocation, with a clear message for every code error.

**Desktop**
- Title "Private Circles", subtitle "Study groups, members and shared files". Primary button `Create circle`.
- Left card *My circles* (name and role: Owner or Member) with a `Join with code` button.
- Right: the selected circle with an **invite code** (format like `KQ-7F3A-92`, shown only to owners and moderators) with `Copy` and `Regenerate`, helper text "Regenerating replaces the old code. Current members keep access.", and a *Members* list with roles (Owner, Moderator, Member).

**Mobile**
- Circle header, invite code with `Copy`, tabs: Discussion, Resources, **Members**.

**Rules**
- **Free plan** can join circles; `Create circle` shows a short Plus upgrade prompt.
- **Join errors** each have their own message: invalid, expired, replaced, rate-limited.
- **Removing a member** asks for confirmation first and states that their shared-file access ends.

---

## 6. Plan and usage

**Purpose:** where AI credits live (profile menu, then Settings). Not on the dashboard.

**Desktop**
- Title "Plan and usage", subtitle "Your plan, AI credits and storage".
- *Current plan* card (name, monthly price, `Change plan`), *AI credits* card (used of allowance, reset date, "Unused credits don't roll over."), *Storage* card (used of allowance, uploads this month).
- Right: one quiet upgrade card ("Need more room to write?") with a single primary button `See plans`.

**Mobile**
- Same cards stacked, then a primary `See plans` button.

**Rules**
- Credit meter shows used, allowance and reset date, and states **no rollover** plainly.
- One upgrade card, one primary button.
- **Allowances are beta placeholders** until the 30-day beta review. Do not hard-code them as final.

# 01 Design system

Source: *KorsIQ High-fidelity screens*, cover page and "Design rules applied".

## Principles

Light theme first. Flat design: **blue, white and black only, no gradients, no decorative AI motifs.** One sans-serif family in two weights. Calm and uncluttered; the next useful action is always visible.

## Palette

| Role | Hex | Use |
|------|-----|-----|
| Primary blue | `#2563EB` | Primary button, active nav, links, progress |
| Deep blue | `#1746A2` | Headings in accents, side-note titles, pressed states |
| Ink | `#111827` | Body and headings |
| Muted text | `#5B6472` | Secondary text, captions |
| Light blue | `#EFF6FF` | Active nav background, info cards, selected states |
| Border | `#E5E7EB` | Card and input borders, dividers |

White is the page and card background.

Three **status colours** (success, warning, error) are proposed but **not yet confirmed**. See `04-handoff-and-open-questions.md`. Until confirmed, do not hard-code new status hues.

## Layout and sizing

| Rule | Value |
|------|-------|
| Desktop design width | 1280 px |
| Mobile design width | 390 px |
| Corner radius | 8 px |
| Minimum touch target | 44 px |
| Primary buttons per screen | **One** |
| Fonts | One sans-serif family, two weights. A system font stack is fastest on slow phones (final choice still open) |

## Navigation

**Desktop:** fixed left sidebar with exactly six destinations, in this order:

1. Overview
2. Study Planner
3. Academic Studio
4. Private Circles
5. Resources
6. Settings

The active item uses Light blue background with Primary blue text and icon.

**Mobile:** bottom navigation with exactly five items: **Home, Planner, Studio, Circles, Library.** Settings is reached from the profile menu in the header. The mobile top bar shows the logo (or section title), a notification bell and the user's initials avatar. Section quick actions live in the header menu.

## Component rules

- **Status is never colour alone.** Always an icon *and* words, or an icon-free text tag where specified (for example Ready, Processing). Colour is never the only signal.
- **AI credits appear in Settings only** (profile menu, then Settings). Never on the dashboard.
- **AI actions are named buttons, not chat bubbles** (for example "Explain my CGPA", "Draft this section"). Cost is shown only on heavy actions.
- **Errors sit beside the field** they belong to, with specific wording.
- **Locked features** show a quiet upgrade prompt: one card, one primary button.
- **Empty and loading states are real.** Never show fake content as a placeholder.
- **Segmented tabs** on mobile are shortened (for example Courses, CGPA, Timetable); the full set opens from the plan or desktop.
- **No vanity metrics.** Show only data that is real and useful (CGPA, course count).

## Accessibility (must pass)

- No horizontal overflow at any supported breakpoint.
- Visible keyboard focus on every interactive element.
- Icon-only controls have accessible names (for example the remove control on each added course).
- Contrast checked on the **final** hex values.
- Touch targets at least 44 px.

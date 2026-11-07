# KorsIQ UI/UX specs

The guided path for the KorsIQ interface. Read these in order before building or changing any screen.

**Status:** planning documents dated 7 November 2026. They are the companion to the *Master Product Blueprint v1.0* (not stored in this repo). All figures and names in the mockups (CGPA values, "Chidi", course codes) are sample content for layout only. Plan limits are **beta values** and are not final.

## Reading order

| # | File | What it covers |
|---|------|----------------|
| 1 | [01-design-system.md](01-design-system.md) | Palette, type, spacing, navigation, components, accessibility rules |
| 2 | [02-screens.md](02-screens.md) | The six key screens, desktop (1280 px) and mobile (390 px) |
| 3 | [03-onboarding.md](03-onboarding.md) | The four onboarding steps: verify email, profile, courses, plan |
| 4 | [04-handoff-and-open-questions.md](04-handoff-and-open-questions.md) | Pre-build checklist, still-to-design list, acceptance criteria, open questions |
| 5 | [05-current-app-gap-notes.md](05-current-app-gap-notes.md) | Where the current code differs from these specs, and decisions needed |

Original design files (the source of truth for visuals) are in [`source/`](source/):

- `KorsIQ_High_Fidelity_Screens.pdf`
- `KorsIQ_Onboarding_Screens.pdf`

## How to use this folder

- **Designing or building a screen:** find it in `02-screens.md` or `03-onboarding.md`, apply the rules in `01-design-system.md`, then check it against the acceptance criteria in `04-handoff-and-open-questions.md`.
- **When a spec and the current code disagree:** the spec is the target, *unless* the item is listed as a decision needed in `05-current-app-gap-notes.md`. Do not silently pick one; raise it.
- **Do not invent content the specs forbid:** no fake data, no invented citations, no decorative AI motifs, no gradients.
- **Logo:** the mockups show a placeholder labelled "logo here". Use the real asset from `public/` (`korsiq-logo.png`, `korsiq-logo-light.png`) via `components/KorsIQLogo.tsx`.

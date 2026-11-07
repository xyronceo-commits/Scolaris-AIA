# 04 Handoff notes and open questions

Source: *KorsIQ High-fidelity screens*, page 7 "Handoff notes".

## Before building

1. Obtain the original logo and **sample its exact blue**; replace the placeholders in the mockups.
2. Run the repository and Supabase audit (**Phase 0**).
3. Confirm the three proposed **status colours**.
4. Choose the font (a system stack is fastest on slow phones).
5. Confirm Studio boundaries per plan **before any pricing page ships**.

## Still to design

- Onboarding (four steps): *designed in `KorsIQ_Onboarding_Screens.pdf`, see `03-onboarding.md`.*
- Locked-feature prompts
- Quota-reached and upload-failure sheets
- Circle join errors
- Desktop Studio at tablet widths
- Empty and loading states for **every** screen

## Acceptance criteria

- No horizontal overflow at supported breakpoints.
- Visible keyboard focus.
- Icon-only controls have accessible names.
- Errors sit beside the field.
- Status uses icon plus words.
- Contrast checked on the final hex values.
- Real loading and empty states, **never fake content**.

## Open questions

- Exact limits per plan (beta).
- Payment provider and methods.
- Whether Plus gets a limited Studio.
- Which grading scales to seed at launch.

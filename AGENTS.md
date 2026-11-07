# KorsIQ: instructions for AI coding agents

KorsIQ (formerly Scolaris AI), tagline **"Outsmart Your Syllabus."**, is an AI study platform for university students. Read this file first, every session.

## Read before changing any UI
- Follow `docs/specs/` (start at `docs/specs/README.md`, then `01` to `04`). It is the design source of truth.
- Differences between the specs and the current code, and open decisions, are in `docs/specs/05-current-app-gap-notes.md`.
- To rebuild the interface in phases, follow `docs/specs/REBUILD_PROMPT.md`.

## Stack and commands
React 19, Vite 6, TypeScript. Tailwind is loaded by CDN script in `index.html` (`darkMode: 'class'`). Express 5 backend in `server.ts` serving `/api/*`. Supabase for auth, Postgres (with RLS) and storage. Gemini via `@google/genai`, **server-side only**.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Runs `tsx server.ts` (app and API on port 3000) |
| `npm run lint` | `tsc --noEmit`. Must pass |
| `npm run build` | `vite build` plus esbuild bundle of the server |

Before you say a task is done, run `npm run lint` and `npm run build`.

## Hard rules
1. **Secrets.** Never commit `.env` or any key. Never give a secret a `VITE_` prefix and never put one in `vite.config.ts` `define` (both publish it in the browser bundle). AI keys exist only on the server. Do not add any "enter your own API key" feature; it was removed on purpose.
2. **Auth and data are Supabase only** (Firebase is gone). Do not weaken or disable RLS. Schema changes go in a **new** file in `supabase/migrations/` with RLS and policies on every new table. Never edit a migration that has already been applied.
3. **No fake content.** No invented data, metrics, citations or placeholder numbers shown as real (this is also a spec rule).
4. **Brand.** The name is KorsIQ. Use `components/KorsIQLogo.tsx` and the files in `public/`. Do not rename internal identifiers (`scolaris_*` localStorage keys, `SCOLARIS_*` env vars); renaming them breaks saved data and deployments.
5. **Git.** Work on a branch, make small commits, never push to `main`, never force-push.
6. **When unsure, ask.** If a spec conflicts with the code, or an item is marked "Decision needed", stop and ask the owner. Do not silently choose.

## Known gotcha
Deployed on Vercel. `server.ts` is a long-running Express server and, as of this writing, the repo has no `vercel.json` or `api/` folder. If AI or file features fail in production, check `/api/health` on the live site before debugging the code.

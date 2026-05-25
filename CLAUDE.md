# Claude Guide

## Project

`JointKakeiBOT` is a mobile-first shared household finance PWA for Ren and Akane. It tracks expenses, income, savings, budgets, receipts, Gmail-derived transactions, push notifications, and Gemini-powered chat/receipt analysis.

## Stack

- Next.js App Router, currently `next@15.5.14`
- React 19, TypeScript
- Tailwind CSS v3, Radix UI, lucide-react
- Supabase Auth / Database
- Gemini via `@google/genai`
- PWA service worker and manifest
- Vitest
- Vercel deployment target

## Important Docs

- `README.md` - app overview and setup
- `INSTRUCTIONS.md` - active fix notes and implementation cautions
- `PERFORMANCE_PLAN.md` / `PERF_LOG.md` - performance work
- `MIGRATION_GUIDE.md` - migration notes
- `FEATURE_PROPOSALS.md` - feature ideas
- `supabase-schema.sql` - database schema
- `.env.example` - required env names only

## Main Paths

- `app/` - Next.js pages and API routes
- `components/pages/` - major app screens
- `components/` - shared and domain components
- `components/ui/` - local UI primitives
- `lib/` - client/server utilities, Supabase, Gemini, domain logic
- `lib/server/` - server-only helpers and validation
- `contexts/` - app state/navigation context
- `public/sw.js` - service worker

## Common Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

Remote launcher aliases:

```bash
aiwork claude kakei
aiwork codex-last kakei
aiwork dev kakei
```

## Working Rules

- Reply in Japanese unless the user asks otherwise.
- Preserve existing user edits and do not reset the worktree.
- Do not edit `.env*` secrets or paste secret values into chat.
- Do not deploy, push, or run production-affecting changes unless explicitly asked.
- Treat iPhone Safari/PWA behavior as a first-class target.
- Keep UI changes consistent with the app's dark/mobile style.
- For Supabase changes, read `supabase-schema.sql` and the affected API/client code first.
- For Gemini or receipt scanning changes, inspect both the UI and server route.
- Prefer small, focused fixes with focused verification.

## Known Risk Areas

- iOS PWA permission behavior for mic/camera features.
- Receipt/image upload and Gemini analysis paths.
- Push notifications and service worker changes.
- Supabase auth/RLS assumptions.
- Any change that affects shared household data, budgets, or transaction writes.

## Good Default Flow

1. Read `INSTRUCTIONS.md` if the task overlaps active notes.
2. Inspect the nearby component/API route and supporting `lib/` helper.
3. Make the smallest useful change.
4. Run focused tests or lint/build depending on risk.
5. Summarize changed files and remaining risks.

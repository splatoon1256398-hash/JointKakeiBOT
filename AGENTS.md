# Codex Guide

## Project

`JointKakeiBOT` is a mobile-first shared household finance PWA. It manages expenses, income, savings, budgets, receipt scanning, Gmail integration, push notifications, and Gemini-powered chat.

## Stack

- Next.js App Router, currently `next@15.5.14`
- React 19, TypeScript
- Tailwind CSS v3
- Supabase
- Gemini via `@google/genai`
- Vitest
- Vercel

## Read First

- `README.md`
- `INSTRUCTIONS.md`
- `supabase-schema.sql`
- `PERFORMANCE_PLAN.md` and `PERF_LOG.md` for performance work
- `.env.example` for env names only

## Key Paths

- `app/`
- `app/api/`
- `components/pages/`
- `components/scan/`
- `components/ui/`
- `lib/`
- `lib/server/`
- `contexts/`
- `public/sw.js`

## Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

Remote launcher:

```bash
aiwork codex-last kakei
aiwork dev kakei
```

## Agent Rules

- Respond in Japanese by default.
- Do not revert user changes or run destructive git commands.
- Do not deploy, push, or change production data unless explicitly requested.
- Do not read or reveal `.env*` secrets.
- Optimize for iPhone Safari/PWA behavior, not desktop-first layouts.
- Keep UI work aligned with the existing dark mobile app style.
- For DB/auth changes, inspect `supabase-schema.sql` and the relevant API/client code.
- For voice, camera, upload, push, or service-worker changes, verify browser/PWA constraints before assuming standard desktop behavior.
- Run focused tests/lint/build when the change has behavior risk.

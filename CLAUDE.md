# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install all dependencies
npm run dev          # start dev server at http://localhost:3000
npm run build        # production build (type-checks + compiles)
npm run lint         # ESLint
```

## Architecture

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, NextAuth.js v4, Supabase (`@supabase/supabase-js` v2).

**Auth flow:** Strava OAuth via a custom NextAuth provider (Strava is not built-in). On sign-in, the `signIn` callback upserts the user into Supabase `users` table. The `jwt` callback stores `userId` (Supabase UUID) in the session token. `session.user.id` is the Supabase row ID used everywhere for DB queries.

**Token refresh:** `src/lib/strava.ts → getValidAccessToken(userId)` checks `token_expiry` and calls `refreshStravaToken` if expiry is within 5 minutes. Always call this before hitting the Strava API.

**Database access:** Two Supabase clients in `src/lib/supabase.ts`:
- `supabase` — anon key, for client components if ever needed
- `supabaseAdmin` — service role key, used in all API routes; bypasses RLS; **never import in client components**

**Key files:**
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth config + `authOptions` (imported by all routes needing session)
- `src/app/api/sync/route.ts` — POST; fetches last 50 Strava activities, filters to `type === 'Run'`, upserts on `strava_id`
- `src/app/dashboard/page.tsx` — server component; protected route; fetches activities and stats via `supabaseAdmin`

**RLS:** Both tables have RLS enabled. Service role bypasses it. Anon key access is blocked by policy. All server routes use `supabaseAdmin`.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in all values before running. The app will not start correctly without `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, Strava credentials, and Supabase credentials.

## Strava OAuth notes

- Strava's token response includes `expires_at` (Unix seconds) — NextAuth maps this to `account.expires_at`
- Callback URL must be registered in the Strava API settings: `http://localhost:3000/api/auth/callback/strava`
- Scope required: `read,activity:read`

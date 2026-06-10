# Aye Aye Trader — Journal

Futures trading journal for prop traders. Next.js 15 + Supabase Auth.

## Local setup

```bash
npm install
cp .env.local.template .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Vercel deploy

1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables (Project Settings > Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## Journal HTML

The vanilla-JS journal lives at `/public/journal.html`. It is loaded by
`JournalBridge` at runtime. This preserves 100% of V1 functionality while
React views are built incrementally.

**To update the journal:** replace `/public/journal.html` with the new build.
No other files change.

## Architecture

```
app/
  page.tsx              → redirects to /login or /dashboard
  login/page.tsx        → Supabase Auth (magic link + password)
  dashboard/page.tsx    → auth-gated, renders DashboardHeader + JournalBridge
  api/auth/callback/    → magic link redirect handler

components/
  LoginForm.tsx         → auth form
  DashboardHeader.tsx   → top bar (email + sign out)
  JournalBridge.tsx     → loads journal.html into the React tree

lib/supabase/
  client.ts             → browser Supabase client
  server.ts             → server Supabase client

middleware.ts           → session refresh + route protection

types/journal.ts        → TypeScript types for the journal data model
```

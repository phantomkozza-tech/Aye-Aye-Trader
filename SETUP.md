# Aye Aye Trader — Supabase migration + Dropbox fix + Support

This update makes **Supabase the server-side source of truth** for every
user's journal (so you control accounts, can refund, and can lock people
out), wires a **support inbox**, and tells you how to **remove the Dropbox
warning**. Everything fails *open* to localStorage, so the app can't brick
even if you haven't finished the steps below.

Do these in order. Test on a **preview deploy** before promoting to production.

---

## 1. Run the database migration  (5 min)

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the entire contents of `supabase/migration.sql` and click **Run**.
3. It creates two tables and backfills rows for any existing users:
   - **`profiles`** — your control panel (plan, status, trial, Stripe IDs).
   - **`journals`** — each user's whole journal as one JSON blob.

It's safe to re-run if you ever need to.

---

## 2. Confirm your Supabase env vars are on Vercel  (1 min)

These already exist (the app uses them for login), but confirm both are set
in **Vercel → Project → Settings → Environment Variables** for *Production*
and *Preview*:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

No new env vars are required for this migration.

---

## 3. Set your support email  (1 min)

Edit **`lib/config.ts`** and change:

```ts
export const SUPPORT_EMAIL = "support@aye-aye-trader.com"; // ← your real inbox
```

It shows up on the **Settings → Support** card with a "Contact support"
button that opens the user's email to you. Refund requests land here, so you
can issue the refund in Stripe before anyone files a chargeback.

---

## 4. Remove the Dropbox "access to ALL your files" warning  (15 min)

Right now the app is a **Full Dropbox** app, so users see a scary consent
screen. You'll swap it for an **App folder** app (only sees its own folder).
You can't convert an existing app's access type, so create a new one:

1. **Dropbox App Console → Create app** → choose:
   - **Scoped access**
   - **App folder** (NOT "Full Dropbox")
   - Name it (e.g. "Aye Aye Trader").
2. On the new app's **Permissions** tab, enable:
   - `files.content.write`
   - `files.content.read`
   Then **Submit**.
3. On the **Settings** tab:
   - Copy the **App key**.
   - Under **OAuth 2 → Redirect URIs**, add your real domain
     (e.g. `https://app.aye-aye-trader.com/dashboard`) and your
     `vercel.app` URL.
4. In the code, open **`lib/dropbox.ts`** and replace the app key on the
   `DROPBOX_APP_KEY` line with your new App-folder key. Nothing else changes —
   the file paths auto-scope into `/Apps/Aye Aye Trader/`.
5. Back in the App Console, click **Apply for production** (App-folder apps
   clear this quickly — it lifts the dev-mode user cap).

After this, the consent screen reads "...access to its own folder," and the
landing page's "we only touch the folder you authorize" claim is literally true.

> Existing testers who connected the OLD app will need to reconnect Dropbox
> once (their localStorage + new Supabase copy keep their data safe meanwhile).

---

## 5. How you actually control accounts  (your day-to-day)

Everything lives in **Supabase → Table editor → `profiles`**:

- **Lock someone out instantly:** set their `status` to `disabled`. The
  middleware blocks them from `/dashboard` on their next request.
- **After a Stripe refund:** set `plan` to `canceled`, drop a line in `note`
  (e.g. "refunded 2026-06-21"), and `disabled` if you want them out.
- **See trial vs paid:** filter `profiles` by `plan`.
- **Read a user's journal:** it's in `journals.data` (jsonb), keyed by `user_id`.

(`plan` and `accounts_created_lifetime` are wired for the Stripe paywall +
hard trial caps later — they don't do anything until that step.)

---

## 6. Test before going live  (important — this touches data)

1. Push to a **branch**, let Vercel build a **Preview**.
2. Log in on the preview as a **test user**, log a trade, refresh — it should
   persist. Check **Supabase → `journals`** has a row with your data.
3. Log in on a **second device/browser** as the same user — your trades
   should appear (that's the new cross-device win).
4. Set your test user's `profiles.status = 'disabled'` and confirm you get
   bounced to `/login?error=disabled`. Set it back to `active`.
5. Only then merge to production.

If anything goes sideways, the app still reads/writes **localStorage**, so no
one loses their working session.

---

## Heads-up (not blocking)

`next@15.3.6` has a published security advisory. Worth bumping to the latest
patched 15.x when you get a clean moment — it's unrelated to this change.

---

## What's intentionally NOT in this update

- **Stripe / the paywall** — separate step. `profiles.plan` is ready for it.
- **Hard trial caps (1 account / 3 strategies enforced server-side)** — that
  needs accounts + strategies pulled into their own tables. For now those
  caps are best enforced softly in the UI; this migration is the foundation
  that makes the hard version possible later.

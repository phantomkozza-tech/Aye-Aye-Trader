# Aye Aye Trader — Paywall (Stage 1): Stripe trial + gate

This adds the **paywall spine**: a signup → checkout (card + 7-day trial) →
journal flow, a webhook that keeps each user's status in sync, and a gate
that routes anyone without an active trial/subscription to a `/subscribe`
plan picker.

It does **not** yet add the write-gates (block CSV / view-only on cancel) or
the trial-trade routing — those come next, once this status signal is proven.

Everything fails safe: if env vars are missing, the gate's profile check
fails open (users get through) rather than locking everyone out.

---

## A. Add these environment variables in Vercel

**Vercel → your project → Settings → Environment Variables.**
Add each for **Preview** (and later Production). Use your **test-mode** values
first so you can test with fake cards.

| Name | Value (test mode) |
|------|-------------------|
| `STRIPE_SECRET_KEY` | your `sk_test_...` secret key (Stripe → Developers → API keys) |
| `STRIPE_PRICE_MONTHLY` | `price_1TkYibGcGszGWETvZ59W6Kqg` |
| `STRIPE_PRICE_YEARLY` | `price_1TkYjzGcGszGWETvAhtJt983` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key (secret) |
| `NEXT_PUBLIC_SITE_URL` | your preview or production URL, e.g. `https://aye-aye-trader.vercel.app` |
| `STRIPE_WEBHOOK_SECRET` | leave blank for now — you'll add it in step C |

> The **service_role** key bypasses security rules so the webhook can write
> billing status. Treat it like a password — Vercel env only, never in code
> or chat.

---

## B. Deploy the preview

Commit the new files to your branch, let Vercel build the Preview. The new
routes that should appear: `/subscribe`, `/api/checkout`,
`/api/stripe/webhook`, `/subscribe/success`.

---

## C. Create the Stripe webhook  (after the preview is live)

The webhook needs your app's URL, which is why it comes after deploy.

1. Stripe (test mode) → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL:** `https://YOUR-PREVIEW-URL/api/stripe/webhook`
3. **Events to send** — click "Select events" and add:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Create it. On the endpoint page, reveal the **Signing secret**
   (`whsec_...`).
5. Put that into Vercel as `STRIPE_WEBHOOK_SECRET`, then **redeploy** so it
   takes effect.

---

## D. Test the whole flow (test mode, fake cards)

1. Open the preview, sign up / log in as a fresh test user.
2. You should be sent to **/subscribe**. Pick a plan.
3. On Stripe Checkout, use the test card:
   - Number: `4242 4242 4242 4242`
   - Expiry: any future date · CVC: any 3 digits · ZIP: any
4. After paying you should land in the **dashboard** (the trial is active).
5. Check **Supabase → profiles** for that user: `plan` should read
   `trialing`, and `stripe_customer_id` / `stripe_subscription_id` should be
   filled in.
6. Optional: in Stripe → that customer → cancel the subscription, then
   refresh — the webhook should flip `plan` to `canceled` and the gate sends
   them back to `/subscribe`.

If you get bounced to `/subscribe` right after paying, the webhook secret or
service-role key is usually the culprit — recheck step A and C.

---

## E. How the states map (for your reference)

`profiles.plan` mirrors the Stripe subscription status:

- `trial` — default on signup, **before** they start a Stripe trial → gate
  sends them to `/subscribe`.
- `trialing` — in their 7-day trial → full access.
- `active` — paying → full access.
- `past_due` — a charge failed → still allowed in for now (Stripe retries).
- `canceled` — canceled/ended → gate sends them to `/subscribe`.

Your kill switch is still separate: `profiles.status = 'disabled'` locks
anyone out regardless of plan.

---

## Going live later

When ready for real money: redo the two products in Stripe **live mode**
(you'll get new `price_...` IDs), create a **live** webhook, and swap the
Vercel env vars to the live `sk_live_...` key, live price IDs, and live
`whsec_...`. The code doesn't change.

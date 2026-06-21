// POST /api/stripe/webhook
// Stripe calls this when a subscription changes (trial converts, payment
// fails, user cancels). We verify the signature, then mirror the
// subscription status into profiles.plan. This is the source of truth for
// ongoing status; the success route handles the very first grant.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig ?? "", secret);
  } catch {
    // Bad signature — reject (no retry needed).
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const plan = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await admin
          .from("profiles")
          .update({ plan, stripe_subscription_id: sub.id })
          .eq("stripe_customer_id", customerId);
        break;
      }
      default:
        break;
    }
  } catch {
    // DB hiccup — return 500 so Stripe retries.
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

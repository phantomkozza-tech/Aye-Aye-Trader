// POST /api/checkout
// Creates a Stripe Checkout session for a 7-day trial subscription.
// Card is REQUIRED up front (payment_method_collection: "always"), phone
// is collected, but no charge happens until the trial ends.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE: Record<"monthly" | "yearly", string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan: "monthly" | "yearly" = body?.plan === "yearly" ? "yearly" : "monthly";
    const price = PRICE[plan];
    if (!price) {
      return NextResponse.json({ error: "Plan price is not configured." }, { status: 500 });
    }

    // Who is this? (authenticated user via cookies)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const admin = createAdminClient();

    // Reuse an existing Stripe customer, or create one and store it.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = (profile?.stripe_customer_id as string | null) || null;
    if (!customerId) {
      const stripe = getStripe();
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_uid: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_uid: user.id },
      },
      payment_method_collection: "always", // require a card even during the trial
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      client_reference_id: user.id,
      success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

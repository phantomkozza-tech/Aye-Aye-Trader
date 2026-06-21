// GET /subscribe/success?session_id=...
// Stripe redirects here after checkout. We verify the session and write the
// user's plan immediately, so access works without waiting on the webhook.
// The webhook still handles later changes (renewals, cancels, failures).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  try {
    const sessionId = new URL(req.url).searchParams.get("session_id");
    if (!sessionId) return NextResponse.redirect(`${origin}/dashboard`);

    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const uid =
      (session.client_reference_id as string | null) ||
      ((session.metadata as Record<string, string> | null)?.supabase_uid ?? null);
    const sub = session.subscription as { id: string; status: string; customer: string } | null;

    if (uid && sub) {
      const admin = createAdminClient();
      const customerId =
        typeof session.customer === "string" ? session.customer : sub.customer;
      await admin
        .from("profiles")
        .update({
          plan: sub.status, // "trialing" now; becomes "active" after first charge
          status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
        })
        .eq("id", uid);
    }
  } catch {
    /* fall through to dashboard; webhook will reconcile */
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}

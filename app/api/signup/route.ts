// POST /api/signup
// Creates a new user that is already email-confirmed, so signup works
// instantly without a confirmation email — independent of the Supabase
// dashboard's "Confirm email" setting. Uses the service-role admin client.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password || String(password).length < 6) {
      return NextResponse.json(
        { error: "Email and a password of at least 6 characters are required." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: String(email),
      password: String(password),
      email_confirm: true, // skip the confirmation email
    });

    if (error) {
      const already = /already|registered|exists/i.test(error.message);
      return NextResponse.json(
        { error: already ? "That email is already registered — try logging in." : error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Signup failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

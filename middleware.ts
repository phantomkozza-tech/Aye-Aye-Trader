import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session (keeps auth token alive)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect /dashboard — redirect to /login if not authenticated
  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Operator kill switch + subscription gate — only on /dashboard.
  // Fails OPEN: any error (table missing, network) lets the user through so
  // the app never bricks.
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status, plan")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && profile.status === "disabled") {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "disabled");
        return NextResponse.redirect(url);
      }

      // Who may load the dashboard at all. 'canceled' is allowed in but the
      // app renders read-only (see DBContext canWrite). Only users who never
      // started a subscription (default 'trial') are sent to the plan picker.
      const CAN_ENTER = ["trialing", "active", "past_due", "canceled"];
      if (profile && !CAN_ENTER.includes(profile.plan)) {
        const url = request.nextUrl.clone();
        url.pathname = "/subscribe";
        return NextResponse.redirect(url);
      }
    } catch {
      /* fail open */
    }
  }

  // Redirect authenticated users away from /login
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Root: signed-in users go straight to the cockpit. Logged-out visitors
  // fall through to the rewrite in next.config (which serves the static
  // landing page from /public/home.html).
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

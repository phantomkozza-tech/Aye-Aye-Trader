// Service-role Supabase client. BYPASSES Row Level Security, so it can
// write billing fields (plan/status/stripe ids) that users can't touch.
// SERVER ONLY — never import in a client component. Reads
// SUPABASE_SERVICE_ROLE_KEY from env (keep that key secret).
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

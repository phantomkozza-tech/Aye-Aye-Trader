import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";
import JournalApp from "@/components/JournalApp";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <DashboardHeader userEmail={user.email ?? ""} />
      <JournalApp />
    </>
  );
}

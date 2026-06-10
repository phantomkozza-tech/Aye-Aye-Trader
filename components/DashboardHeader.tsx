"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props {
  userEmail: string;
}

export default function DashboardHeader({ userEmail }: Props) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
        padding: "8px 24px",
        background: "var(--panel)",
        borderBottom: "1px solid var(--line)",
        fontSize: 12,
        color: "var(--mut)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <span>{userEmail}</span>
      <button
        onClick={signOut}
        style={{
          background: "transparent",
          border: "1px solid var(--line)",
          borderRadius: 6,
          color: "var(--mut)",
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 12,
          transition: ".12s",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--red)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--red)";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--line)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--mut)";
        }}
      >
        Sign out
      </button>
    </div>
  );
}

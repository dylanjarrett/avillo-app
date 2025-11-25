// src/app/page.tsx

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Force this page to be dynamic so Next/Vercel
// does NOT try to statically pre-render "/"
export const dynamic = "force-dynamic";

export default async function RootPage() {
  let session = null;

  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    // If anything goes wrong during auth, just treat as not signed in.
    console.error("RootPage getServerSession error:", err);
  }

  if (session) {
    // Logged in → go to dashboard
    redirect("/dashboard");
  }

  // Not signed in (or auth failed) → go to login
  redirect("/login");
}

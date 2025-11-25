// src/app/page.tsx
"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // If signed in → go to dashboard
  if (session) {
    redirect("/dashboard");
  }

  // If not signed in → go to login
  redirect("/login");
}
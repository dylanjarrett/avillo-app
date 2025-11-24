// src/app/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // If signed in, drop them into the main app
  if (session) {
    redirect("/dashboard");
  }

  // If not signed in, send to login
  redirect("/login");
}

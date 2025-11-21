// src/app/page.tsx

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // adjust if your authOptions live somewhere else
import { redirect } from "next/navigation";
import AvilloClientPage from "./AvilloClientPage";

export default async function Page() {
  const session = await getServerSession(authOptions);

  // If user is NOT logged in, send them to the login page
  if (!session) {
    redirect("/login"); // change to your actual login route if different
  }

  // Authenticated → render the full intelligence UI
  return <AvilloClientPage />;
}
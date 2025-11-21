// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  // When user hits "/", send them to dashboard
  redirect("/dashboard");
}

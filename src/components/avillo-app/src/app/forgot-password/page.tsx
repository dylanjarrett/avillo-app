// src/app/forgot-password/page.tsx
"use client";

import { FormEvent, useState } from "react";
import AppShell from "@/components/AppShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/password/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Something went wrong. Please try again.");
        return;
      }

      // API is intentionally vague about whether the email exists
      setStatus("success");
      setMessage(
        "If an account exists for that email, a reset link has been sent. Check your inbox and spam folder."
      );
    } catch (err) {
      console.error("forgot-password error", err);
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const isSubmitting = status === "loading";

  return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-6 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9CA3AF]">
            Account
          </p>
          <h1 className="mt-2 text-xl font-semibold text-white">Reset your password</h1>
          <p className="mt-2 text-xs text-[#AAB4C0]">
            Enter the email you use for Avillo and we&apos;ll send you a secure link to choose a
            new password.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#9CA3AF]"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#020617] px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-[#64748B] focus:border-[#4D9FFF] focus:ring-1 focus:ring-[#4D9FFF]"
                placeholder="you@example.com"
              />
            </div>

            {message && (
              <div
                className={`rounded-lg px-3 py-2 text-[11px] ${
                  status === "success"
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border border-red-500/40 bg-red-500/10 text-red-200"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0] disabled:cursor-not-allowed disabled:bg-[#1f2937] disabled:text-[#9CA3AF]"
            >
              {isSubmitting ? "Sending reset link…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] text-[#6B7280]">
            Remembered it?{" "}
            <a
              href="/login"
              className="font-medium text-[#93C5FD] underline-offset-2 hover:underline"
            >
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </AppShell>
  );
} 

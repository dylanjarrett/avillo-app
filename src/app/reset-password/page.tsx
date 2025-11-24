"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";

function AuthLogo() {
  return (
    <div className="mb-6 flex flex-col items-center">
      <Image
        src="/avillo-logo-cream.PNG"
        alt="Avillo"
        width={260}
        height={120}
        priority
        className="h-auto w-[220px] md:w-[260px] drop-shadow-[0_0_40px_rgba(244,210,106,0.6)]"
      />
    </div>
  );
}

type ResetPasswordPageProps = {
  searchParams: { token?: string };
};

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = searchParams?.token || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const missingToken = !token;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (missingToken) return;

    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Unable to reset password.");
      }

      setSuccess("Password updated. You can now sign in with your new password.");
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-4">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center py-10">
        <AuthLogo />

        <div className="w-full rounded-3xl border border-[rgba(148,163,184,0.35)] bg-[rgba(9,13,28,0.96)] px-6 py-7 shadow-[0_0_50px_rgba(15,23,42,0.9)] backdrop-blur">
          <div className="mb-6 text-center">
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[var(--avillo-cream-muted)] uppercase">
              New password
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[var(--avillo-cream)]">
              Set your new password
            </h1>
            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
              Choose a secure password you haven’t used before with Avillo.
            </p>
          </div>

          {missingToken && (
            <div className="mb-4 rounded-lg border border-red-400/70 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
              This reset link is missing a token or has expired. Please request a
              new link from the{" "}
              <Link href="/forgot-password" className="underline">
                forgot password
              </Link>{" "}
              page.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/70 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-emerald-400/70 bg-emerald-950/40 px-3 py-2 text-[11px] text-emerald-100">
              {success}
            </div>
          )}

          {!missingToken && (
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                  New password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="avillo-input w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                  Confirm password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="avillo-input w-full"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-3 flex w-full items-center justify-center rounded-full border border-[var(--avillo-cream-soft)] bg-[var(--avillo-cream)] px-4 py-2 text-[13px] font-semibold text-[#050814] shadow-[0_0_26px_rgba(244,210,106,0.35)] transition hover:bg-[#f0ebdd] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Updating password…" : "Update password"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
            Ready to sign in?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--avillo-cream)] hover:underline"
            >
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

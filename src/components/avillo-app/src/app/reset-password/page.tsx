// src/app/reset-password/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";

type StatusState = {
  type: "idle" | "success" | "error";
  message: string;
};

// ----- Outer wrapper so useSearchParams is inside Suspense -----

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex h-[60vh] items-center justify-center text-sm text-slate-400">
            Loading reset link…
          </div>
        </AppShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

// ----- Actual page content that uses useSearchParams -----

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    type: "idle",
    message: "",
  });

  const hasChanges =
    newPassword.length > 0 ||
    confirmNewPassword.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({ type: "idle", message: "" });

    if (!token || !email) {
      setStatus({
        type: "error",
        message: "Reset link is invalid or missing. Please request a new one.",
      });
      return;
    }

    if (!newPassword || !confirmNewPassword) {
      setStatus({
        type: "error",
        message: "Please enter and confirm your new password.",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setStatus({
        type: "error",
        message: "New password and confirmation do not match.",
      });
      return;
    }

    if (newPassword.length < 8) {
      setStatus({
        type: "error",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await fetch("/api/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus({
          type: "error",
          message: data.error || "Unable to reset password. Please try again.",
        });
        return;
      }

      setStatus({
        type: "success",
        message: "Your password has been updated. You can now sign in.",
      });

      // optional: redirect after a short delay
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      console.error("reset password error", err);
      setStatus({
        type: "error",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="flex justify-center py-12 md:py-16">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[rgba(7,10,20,0.97)] px-6 py-7 shadow-[0_0_30px_rgba(0,0,0,0.7)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
            Account
          </p>
          <h1 className="mt-2 text-lg font-semibold text-white">
            Choose a new password
          </h1>
          <p className="mt-1 text-xs text-[#AAB4C0]">
            For security, this link will expire after a short period. Enter a strong new
            password to secure your Avillo account.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.16em] text-[#9CA3AF]">
                New password
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none ring-0 transition placeholder:text-[#4B5563] focus:border-[#4D9FFF] focus:bg-black/40"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.16em] text-[#9CA3AF]">
                Confirm password
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none ring-0 transition placeholder:text-[#4B5563] focus:border-[#4D9FFF] focus:bg-black/40"
                placeholder="Repeat new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>

            {status.type !== "idle" && (
              <p
                className={`mt-1 text-[11px] ${
                  status.type === "error"
                    ? "text-red-300"
                    : "text-emerald-300"
                }`}
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={!hasChanges || isSubmitting}
              className={`mt-3 flex w-full items-center justify-center rounded-full px-4 py-2 text-[11px] font-semibold transition ${
                !hasChanges || isSubmitting
                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-[#6B7280]"
                  : "border border-transparent bg-[#2563EB] text-white shadow-[0_0_20px_rgba(37,99,235,0.7)] hover:bg-[#1D4ED8]"
              }`}
            >
              {isSubmitting ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
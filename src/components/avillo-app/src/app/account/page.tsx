// src/app/account/page.tsx
"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type StatusType = "idle" | "success" | "error";

interface StatusState {
  type: StatusType;
  message: string;
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Profile fields
  const [name, setName] = useState("");
  const [brokerage, setBrokerage] = useState("");

  // Email & login
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // Initial values for dirty checks
  const [initialName, setInitialName] = useState("");
  const [initialBrokerage, setInitialBrokerage] = useState("");
  const [initialEmail, setInitialEmail] = useState("");

  // Status messages
  const [profileStatus, setProfileStatus] = useState<StatusState>({
    type: "idle",
    message: "",
  });
  const [emailStatus, setEmailStatus] = useState<StatusState>({
    type: "idle",
    message: "",
  });
  const [passwordStatus, setPasswordStatus] = useState<StatusState>({
    type: "idle",
    message: "",
  });

  // Loading flags
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Redirect unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Prefill from session
  useEffect(() => {
    if (!session?.user) return;

    const sessionName = session.user.name || "";
    const sessionEmail = session.user.email || "";
    // brokerage is optional, stored in Prisma
    const sessionBrokerage =
      ((session.user as any).brokerage as string | undefined) || "";

    setName(sessionName);
    setBrokerage(sessionBrokerage);
    setNewEmail("");
    setEmailPassword("");

    setInitialName(sessionName);
    setInitialBrokerage(sessionBrokerage);
    setInitialEmail(sessionEmail);
  }, [session]);

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading account…
        </div>
      </AppShell>
    );
  }

  if (!session?.user) return null;

  const currentEmail = session.user.email ?? "";
  const firstName =
    session.user.name?.split(" ")[0] ??
    session.user.email?.split("@")[0] ??
    "there";

  // emailVerified comes from Prisma via adapter (optional)
  const emailVerified = (session.user as any).emailVerified ?? null;
  const showVerifyBanner = !emailVerified;

  // ---------- Dirty-state helpers ----------

  const isProfileDirty =
    name.trim() !== initialName.trim() ||
    brokerage.trim() !== initialBrokerage.trim();

  const isEmailDirty =
    newEmail.trim().length > 0 &&
    newEmail.trim().toLowerCase() !== initialEmail.toLowerCase() &&
    emailPassword.trim().length > 0;

  const isPasswordDirty =
    currentPassword.trim().length > 0 ||
    newPassword.trim().length > 0 ||
    confirmNewPassword.trim().length > 0;

  // Shared button styling
  const primaryButtonClasses = (enabled: boolean) =>
    [
      "w-full rounded-full px-4 py-2 text-xs font-semibold transition",
      enabled
        ? "bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#06B6D4] text-white shadow-[0_0_18px_rgba(37,99,235,0.55)] hover:shadow-[0_0_24px_rgba(37,99,235,0.75)] hover:from-[#1D4ED8] hover:via-[#4338CA] hover:to-[#0891B2]"
        : "bg-white/5 text-[#6B7280] border border-white/10 cursor-default",
    ].join(" ");

  // ---------- Handlers ----------

  async function handleSaveProfile() {
    if (!isProfileDirty || isSavingProfile) return;

    setIsSavingProfile(true);
    setProfileStatus({ type: "idle", message: "" });

    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), brokerage: brokerage.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileStatus({
          type: "error",
          message: data.error || "Something went wrong saving your profile.",
        });
      } else {
        setProfileStatus({
          type: "success",
          message: "Profile updated.",
        });
        setInitialName(name.trim());
        setInitialBrokerage(brokerage.trim());
      }
    } catch (err) {
      console.error("Profile update error:", err);
      setProfileStatus({
        type: "error",
        message: "Unable to update profile right now.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleUpdateEmail() {
    if (!isEmailDirty || isUpdatingEmail) return;

    setIsUpdatingEmail(true);
    setEmailStatus({ type: "idle", message: "" });

    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: newEmail.trim(),
          currentPassword: emailPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setEmailStatus({
          type: "error",
          message: data.error || "Could not update email.",
        });
      } else {
        setEmailStatus({
          type: "success",
          message: "Email updated. Use this to sign in next time.",
        });
        setInitialEmail(newEmail.trim());
        setNewEmail("");
        setEmailPassword("");
      }
    } catch (err) {
      console.error("Email update error:", err);
      setEmailStatus({
        type: "error",
        message: "Unable to update email right now.",
      });
    } finally {
      setIsUpdatingEmail(false);
    }
  }

  async function handleUpdatePassword() {
    if (!isPasswordDirty || isUpdatingPassword) return;

    setIsUpdatingPassword(true);
    setPasswordStatus({ type: "idle", message: "" });

    if (newPassword !== confirmNewPassword) {
      setPasswordStatus({
        type: "error",
        message: "New passwords do not match.",
      });
      setIsUpdatingPassword(false);
      return;
    }

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPasswordStatus({
          type: "error",
          message: data.error || "Could not update password.",
        });
      } else {
        setPasswordStatus({
          type: "success",
          message: "Password updated successfully.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      }
    } catch (err) {
      console.error("Password update error:", err);
      setPasswordStatus({
        type: "error",
        message: "Unable to update password right now.",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  // ---------- Render ----------

  return (
    <AppShell>
      <div className="pb-16">
        {/* Email verification banner */}
        {showVerifyBanner && (
          <div className="mb-4 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-[#78350F] via-[#111827] to-[#020617] px-4 py-3 text-xs text-amber-50 shadow-[0_0_24px_rgba(245,158,11,0.35)] sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                  Verify your email
                </p>
                <p className="mt-1 text-[11px] text-amber-50/90">
                  We recommend confirming{" "}
                  <span className="font-semibold">{currentEmail}</span> to keep
                  your Avillo account secure. Check your inbox (and spam) for a
                  verification email.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-amber-500/10 px-4 py-1.5 text-[11px] font-semibold text-amber-100 opacity-70"
              >
                Resend link · Coming soon
              </button>
            </div>
          </div>
        )}

        {/* Header row */}
        <header className="mb-4 flex flex-col gap-4 md:mb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#9CA3AF]">
              Account
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Profile &amp; security
            </h1>
            <p className="mt-2 max-w-xl text-xs text-[#AAB4C0]">
              Manage your Avillo profile, login details, and security preferences.
              Your account controls access to all listings and workflows
              connected to Avillo.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/billing")}
              className="rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-medium text-slate-100 transition hover:border-[#4D9FFF] hover:bg-[#111827]"
            >
              Open billing
            </button>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-full bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_18px_rgba(220,38,38,0.5)] transition hover:bg-[#B91C1C]"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Account summary row */}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,22,0.98)] p-4 text-xs text-slate-200 shadow-[0_0_22px_rgba(0,0,0,0.6)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
              Plan
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              Founding Agent (Beta)
            </p>
            <p className="mt-1 text-[11px] text-[#AAB4C0]">
              Locked beta pricing while we tune Avillo with early agents.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,22,0.98)] p-4 text-xs text-slate-200 shadow-[0_0_22px_rgba(0,0,0,0.6)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
              Login
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {currentEmail}
            </p>
            <p className="mt-1 text-[11px] text-[#AAB4C0]">
              Use this email for Avillo sign-in and account notifications.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,22,0.98)] p-4 text-xs text-slate-200 shadow-[0_0_22px_rgba(0,0,0,0.6)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
              Status
            </p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">
              Active workspace
            </p>
            <p className="mt-1 text-[11px] text-[#AAB4C0]">
              Logged in as <span className="font-medium">{firstName}</span>. You
              can update security and data settings from this page.
            </p>
          </div>
        </section>

        {/* Support strip */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-r from-[#020617] via-[#020617] to-[#111827] px-4 py-3 text-[11px] text-slate-200 shadow-[0_0_22px_rgba(0,0,0,0.5)] sm:px-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[11px] font-medium text-[#E5E7EB]">
              Need help with your account? We&apos;re here for you.
            </p>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <a
                href="mailto:support@app.avillo.io"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-50"
              >
                support@app.avillo.io
              </a>
              <span className="hidden text-slate-600 sm:inline">•</span>
              <a
                href="mailto:billing@app.avillo.io"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-50"
              >
                billing@app.avillo.io
              </a>
              <span className="hidden text-slate-600 sm:inline">•</span>
              <a
                href="mailto:sales@app.avillo.io"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-50"
              >
                sales@app.avillo.io
              </a>
              <span className="hidden text-slate-600 sm:inline">•</span>
              <a
                href="mailto:hello@app.avillo.io"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-50"
              >
                hello@app.avillo.io
              </a>
            </div>
          </div>
        </section>

        {/* MAIN SECTIONS */}
        <div className="space-y-6">
          {/* PROFILE */}
          <section className="rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-5 shadow-[0_0_26px_rgba(0,0,0,0.7)] sm:p-6">
            <h2 className="text-sm font-semibold text-white">Profile</h2>
            <p className="mt-1 text-[11px] text-[#AAB4C0]">
              These details are tied to your Avillo login and may appear on your
              AI-generated marketing and presentations.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setProfileStatus({ type: "idle", message: "" });
                  }}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Brokerage
                </label>
                <input
                  type="text"
                  value={brokerage}
                  onChange={(e) => {
                    setBrokerage(e.target.value);
                    setProfileStatus({ type: "idle", message: "" });
                  }}
                  placeholder="e.g., Compass, Coldwell Banker…"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!isProfileDirty || isSavingProfile}
                className={primaryButtonClasses(isProfileDirty && !isSavingProfile)}
              >
                {isSavingProfile ? "Saving…" : "Save profile"}
              </button>

              {profileStatus.type !== "idle" && (
                <p
                  className={`text-[11px] ${
                    profileStatus.type === "success"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {profileStatus.message}
                </p>
              )}
            </div>
          </section>

          {/* EMAIL & LOGIN */}
          <section className="rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-5 shadow-[0_0_26px_rgba(0,0,0,0.7)] sm:p-6">
            <h2 className="text-sm font-semibold text-white">Email &amp; login</h2>
            <p className="mt-1 text-[11px] text-[#AAB4C0]">
              This is the email you use to sign in to Avillo and where we&apos;ll
              send account-related updates.
            </p>

            <div className="mt-4 space-y-3 text-[11px]">
              <div>
                <span className="font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Current email
                </span>
                <p className="mt-1 text-xs text-white">{currentEmail}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  New email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailStatus({ type: "idle", message: "" });
                  }}
                  placeholder="your.name@yourdomain.com"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Current password
                </label>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => {
                    setEmailPassword(e.target.value);
                    setEmailStatus({ type: "idle", message: "" });
                  }}
                  placeholder="Required to confirm email change"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleUpdateEmail}
                disabled={!isEmailDirty || isUpdatingEmail}
                className={primaryButtonClasses(isEmailDirty && !isUpdatingEmail)}
              >
                {isUpdatingEmail ? "Updating…" : "Update email"}
              </button>

              {emailStatus.type !== "idle" && (
                <p
                  className={`text-[11px] ${
                    emailStatus.type === "success"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {emailStatus.message}
                </p>
              )}
            </div>

            <p className="mt-3 text-[11px] text-[#6B7280]">
              For Google-only accounts, reach out to{" "}
              <a
                href="mailto:support@app.avillo.io"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-100"
              >
                support@app.avillo.io
              </a>{" "}
              if you need to move this login to a new address.
            </p>
          </section>

          {/* PASSWORD & SECURITY */}
          <section className="rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-5 shadow-[0_0_26px_rgba(0,0,0,0.7)] sm:p-6">
            <h2 className="text-sm font-semibold text-white">
              Password &amp; security
            </h2>
            <p className="mt-1 text-[11px] text-[#AAB4C0]">
              Update your Avillo password. For accounts created with Google
              sign-in, this enables email + password-based login as well.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Current password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordStatus({ type: "idle", message: "" });
                  }}
                  placeholder="Enter current password"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  New password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordStatus({ type: "idle", message: "" });
                  }}
                  placeholder="At least 8 characters"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => {
                    setConfirmNewPassword(e.target.value);
                    setPasswordStatus({ type: "idle", message: "" });
                  }}
                  placeholder="Repeat new password"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none ring-0 focus:border-[#4D9FFF]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleUpdatePassword}
                disabled={!isPasswordDirty || isUpdatingPassword}
                className={primaryButtonClasses(
                  isPasswordDirty && !isUpdatingPassword
                )}
              >
                {isUpdatingPassword ? "Updating…" : "Update password"}
              </button>

              {passwordStatus.type !== "idle" && (
                <p
                  className={`text-[11px] ${
                    passwordStatus.type === "success"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {passwordStatus.message}
                </p>
              )}
            </div>

            <p className="mt-3 text-[11px] text-[#6B7280]">
              Forgot your current password?{" "}
              <a
                href="/forgot-password"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-100"
              >
                Use the reset link instead.
              </a>
            </p>
          </section>

          {/* DANGER ZONE */}
          <section className="rounded-2xl border border-red-500/40 bg-gradient-to-r from-[#450a0a] via-[#111827] to-[#020617] p-5 text-xs text-[#FCA5A5] shadow-[0_0_28px_rgba(248,113,113,0.5)] sm:p-6">
            <h2 className="text-sm font-semibold text-white">Danger zone</h2>
            <p className="mt-1 text-[11px] text-[#FCA5A5]">
              Deleting your account will permanently remove your access to Avillo.
              We recommend exporting any important AI outputs or templates before
              you leave.
            </p>
            <p className="mt-2 text-[11px] text-[#FCA5A5]">
              To safely close your workspace or request a data export, reach out
              to{" "}
              <a
                href="mailto:support@app.avillo.io"
                className="underline decoration-dotted underline-offset-2 hover:text-red-50"
              >
                support@app.avillo.io
              </a>{" "}
              and we&apos;ll walk you through the process.
            </p>

            <button
              type="button"
              className="mt-4 w-full rounded-full border border-red-400/70 bg-red-500/10 px-4 py-2 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/20"
            >
              Delete account (contact support)
            </button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

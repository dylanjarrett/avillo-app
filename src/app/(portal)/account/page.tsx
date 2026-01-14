// src/app/(portal)/account/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { signOut } from "next-auth/react";

type Profile = {
  id: string;
  name: string | null;
  email: string;
  brokerage: string | null;
  phone: string | null;
  createdAt?: string;
};

type WorkspaceType = "PERSONAL" | "TEAM";
type WorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

type WorkspaceBilling = {
  accessLevel: "BETA" | "PAID" | "EXPIRED";
  plan: "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE";
  subscriptionStatus: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeBasePriceId?: string | null;
  stripeSeatPriceId?: string | null;
};

type AccountMeResponse =
  | {
      ok: true;
      user: {
        id: string;
        name: string;
        email: string;
        role: "USER" | "ADMIN";
        brokerage: string;
        phone: string;
        defaultWorkspaceId: string | null;
        createdAt: string;
      };
      workspace: {
        id: string;
        name: string;
        type: WorkspaceType;
        role: WorkspaceRole;
        createdByUserId: string | null;
        createdAt: string;
        billing: WorkspaceBilling;
      };
      seatUsage: {
        usedSeats: number;
        pendingInvites: number;
        seatLimit: number;
        includedSeats: number;
        remaining: number;
      };
      entitlements: any;
    }
  | { ok?: false; error?: string };

function normalizePhoneInput(raw: string) {
  return raw.replace(/[^\d+]/g, "").trim();
}

function formatPhonePretty(value: string) {
  if (value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function workspaceLabel(type?: WorkspaceType) {
  return type === "TEAM" ? "Team workspace" : "Personal workspace";
}

function roleLabel(role?: WorkspaceRole) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Agent";
}

function planLabel(plan?: WorkspaceBilling["plan"]) {
  if (!plan) return "—";
  if (plan === "FOUNDING_PRO") return "Founding Pro";
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

export default function AccountPage() {
  // Combined "me" context
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);

  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [billing, setBilling] = useState<WorkspaceBilling | null>(null);
  const [seatUsage, setSeatUsage] = useState<{
    usedSeats: number;
    pendingInvites: number;
    seatLimit: number;
    includedSeats: number;
    remaining: number;
  } | null>(null);

  // Profile form state (name + brokerage)
  const [nameInput, setNameInput] = useState("");
  const [brokerageInput, setBrokerageInput] = useState("");

  // Profile save status
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // Phone change state (one-way: saved via /api/account/change-phone)
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState<string | null>(null);

  // Change email state
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // ------- Load /api/account/me on mount -------
  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      setMeError(null);

      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        const data: AccountMeResponse = await res.json().catch(() => ({} as any));

        if (res.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!res.ok || !(data as any)?.ok) {
          if (!cancelled) {
            setMeError((data as any)?.error ?? "There was an issue loading your account.");
          }
          return;
        }

        const d = data as Extract<AccountMeResponse, { ok: true }>;

        const nextProfile: Profile = {
          id: d.user.id,
          name: d.user.name || null,
          email: d.user.email,
          brokerage: d.user.brokerage || null,
          phone: d.user.phone || null,
          createdAt: d.user.createdAt,
        };

        if (!cancelled) {
          setProfile(nextProfile);
          setSavedProfile(nextProfile);
          setNameInput(nextProfile.name ?? "");
          setBrokerageInput(nextProfile.brokerage ?? "");
          setPhoneInput(nextProfile.phone ?? "");

          setWorkspaceName(d.workspace?.name ?? "");
          setWorkspaceType(d.workspace?.type ?? null);
          setWorkspaceRole(d.workspace?.role ?? null);
          setBilling(d.workspace?.billing ?? null);
          setSeatUsage(d.seatUsage ?? null);
        }
      } catch (err) {
        console.error("Failed to load /api/account/me", err);
        if (!cancelled) setMeError("Something went wrong while loading your account.");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------- Derived state -------

  const profileDirty =
    !!savedProfile &&
    (nameInput.trim() !== (savedProfile.name ?? "") ||
      brokerageInput.trim() !== (savedProfile.brokerage ?? ""));

  const phoneDirty = useMemo(() => {
    if (!savedProfile) return false;
    const a = normalizePhoneInput(phoneInput || "");
    const b = normalizePhoneInput(savedProfile.phone || "");
    return a !== b;
  }, [phoneInput, savedProfile]);

  const phoneValid = useMemo(() => {
    const cleaned = normalizePhoneInput(phoneInput);
    if (!cleaned) return true;

    const digitsOnly = cleaned.startsWith("+")
      ? cleaned.slice(1).replace(/\D/g, "")
      : cleaned.replace(/\D/g, "");

    if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;
    if (cleaned.includes("+") && !cleaned.startsWith("+")) return false;

    return true;
  }, [phoneInput]);

  const changeEmailValid =
    !!profile &&
    newEmail.trim().length > 0 &&
    newEmail.trim().toLowerCase() !== profile.email.toLowerCase() &&
    emailPassword.length > 0 &&
    newEmail.includes("@") &&
    newEmail.length <= 120;

  const changePasswordValid =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmNewPassword;

  const isTeamWorkspace = workspaceType === "TEAM";
  const isEnterprise = billing?.plan === "ENTERPRISE";
  const isSoloSeat =
    !seatUsage ? true : seatUsage.seatLimit <= 1 && seatUsage.usedSeats <= 1 && seatUsage.pendingInvites === 0;

  const workspacePill = useMemo(() => {
    if (!workspaceType) return "Workspace";
    if (workspaceType === "PERSONAL") return "Personal";
    return isEnterprise ? "Enterprise" : "Team";
  }, [workspaceType, isEnterprise]);

  const workspaceNote = useMemo(() => {
    // Keep it minimal and non-billing-heavy.
    if (!workspaceType) return "Workspace details are workspace-scoped.";
    if (workspaceType === "PERSONAL") {
      return "You’re working in your personal workspace. Team access is managed from Workspace settings when enabled.";
    }
    // TEAM
    return "You’re working in a team workspace. Seats, roles, and invites live in Workspace settings.";
  }, [workspaceType]);

  // ------- Handlers -------

  async function handleProfileSave() {
    if (!profile) return;
    if (!profileDirty) return;

    setProfileSaving(true);
    setProfileSaveMessage(null);
    setProfileSaveError(null);

    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.trim(),
          brokerage: brokerageInput.trim(),
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!res.ok || !data?.ok) {
        setProfileSaveError(data?.error ?? "Failed to update profile.");
        return;
      }

      const updatedUser: Profile = data.user;
      setProfile(updatedUser);
      setSavedProfile(updatedUser);
      setProfileSaveMessage("Profile updated.");
    } catch (err) {
      console.error("update-profile error", err);
      setProfileSaveError("Something went wrong updating your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePhoneSave() {
    if (!profile) return;
    if (!phoneDirty) return;

    setPhoneSaving(true);
    setPhoneError(null);
    setPhoneSuccess(null);

    try {
      const cleaned = normalizePhoneInput(phoneInput);

      const res = await fetch("/api/account/change-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleaned.length ? cleaned : null,
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!res.ok) {
        setPhoneError(data?.error ?? "Something went wrong while updating your phone.");
        return;
      }

      const nextPhone =
        typeof data?.phone !== "undefined"
          ? (data.phone as string | null)
          : (data?.user?.phone as string | null);

      setProfile((prev) => (prev ? { ...prev, phone: nextPhone ?? null } : prev));
      setSavedProfile((prev) => (prev ? { ...prev, phone: nextPhone ?? null } : prev));
      setPhoneInput(nextPhone ?? "");
      setPhoneSuccess("Phone updated.");
    } catch (err) {
      console.error("change-phone error", err);
      setPhoneError("Something went wrong while updating your phone.");
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!changeEmailValid || !profile) return;

    setEmailLoading(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: newEmail.trim(),
          password: emailPassword,
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!res.ok) {
        setEmailError(data?.error ?? "Failed to update email.");
        return;
      }

      if (data?.requiresLogout) {
        setEmailSuccess(data?.message ?? "Email updated. You’ll be redirected to log in again.");
        await signOut({ callbackUrl: "/login" });
        return;
      }

      setEmailSuccess(data?.message ?? "Email updated. Please sign in again with your new address.");

      setProfile((prev) => (prev ? { ...prev, email: newEmail.trim().toLowerCase() } : prev));
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      console.error("change-email error", err);
      setEmailError("Something went wrong while updating your email.");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!changePasswordValid) return;

    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!res.ok) {
        setPasswordError(data?.error ?? "Failed to update password.");
        return;
      }

      setPasswordSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      console.error("change-password error", err);
      setPasswordError("Something went wrong while updating your password.");
    } finally {
      setPasswordLoading(false);
    }
  }

  function handleSignOutClick() {
    signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ACCOUNT"
        title="Account settings"
        subtitle="Update your personal profile and login preferences. Workspace access, seats, and roles are managed in Workspace settings."
      />

      {/* Minimal workspace context strip */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/70 px-5 py-4 shadow-[0_0_30px_rgba(15,23,42,0.75)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.14),transparent_55%)] opacity-40 blur-3xl" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Current workspace
            </p>

            {meLoading ? (
              <p className="mt-2 text-xs text-slate-400/90">Loading workspace…</p>
            ) : meError ? (
              <p className="mt-2 text-xs text-rose-300">{meError}</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-200/90">
                  <span className="font-semibold text-slate-50">{workspaceName || "—"}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-200/90">{workspaceLabel(workspaceType ?? undefined)}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-200/90">{roleLabel(workspaceRole ?? undefined)}</span>
                  {!!seatUsage && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-200/90">
                        Seats: {seatUsage.usedSeats}/{seatUsage.seatLimit}
                        {seatUsage.pendingInvites > 0 ? ` (+${seatUsage.pendingInvites} pending)` : ""}
                      </span>
                    </>
                  )}
                </div>

                <p className="mt-2 text-[11px] text-slate-400/90">{workspaceNote}</p>
              </>
            )}
          </div>

          <span
            className={cx(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold",
              workspaceType
                ? "border-amber-100/40 bg-amber-50/5 text-amber-100"
                : "border-slate-700 bg-slate-900/60 text-slate-300"
            )}
          >
            {workspacePill}
            {!!billing?.plan && (
              <span className="ml-2 text-slate-300/90">
                • {planLabel(billing.plan)}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Profile card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Profile
          </p>
          <p className="mt-2 text-xs text-slate-200/90">
            These details help personalize your outputs and enable SMS “Run now” testing. Outbound SMS is still sent from a shared Avillo number.
          </p>

          {meLoading ? (
            <p className="mt-4 text-xs text-slate-400/90">Loading profile…</p>
          ) : meError ? (
            <p className="mt-4 text-xs text-rose-300">{meError}</p>
          ) : (
            <>
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">Full name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">Brokerage / team</label>
                  <input
                    type="text"
                    value={brokerageInput}
                    onChange={(e) => setBrokerageInput(e.target.value)}
                    placeholder="Your brokerage name"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Phone (for “Run now” SMS tests)
                  </label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      setPhoneError(null);
                      setPhoneSuccess(null);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="+1 555 555 5555"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                    <p className="text-slate-400/90">
                      Recommended: <span className="font-mono text-amber-100">+1</span> format. If you enter 10 digits, Avillo will still store what you submit.
                    </p>
                    <span className="text-slate-400/80">
                      {phoneInput.trim() ? `Preview: ${formatPhonePretty(phoneInput.trim())}` : "—"}
                    </span>
                  </div>

                  {!phoneValid && (
                    <p className="mt-1 text-[11px] text-rose-300">
                      Enter a valid phone number (10–15 digits). You can include a leading +.
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="space-y-1 text-[11px]">
                      {phoneSuccess && <p className="text-emerald-300">{phoneSuccess}</p>}
                      {phoneError && <p className="text-rose-300">{phoneError}</p>}
                      {!phoneSuccess && !phoneError && (
                        <p className="text-slate-400/90">This updates immediately and is used only for test sends.</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handlePhoneSave}
                      disabled={!phoneDirty || !phoneValid || phoneSaving}
                      className={cx(
                        "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition",
                        phoneDirty && phoneValid && !phoneSaving
                          ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                          : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default"
                      )}
                    >
                      {phoneSaving ? "Saving..." : "Save phone"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">Login email</label>
                  <input
                    type="email"
                    value={profile?.email ?? ""}
                    readOnly
                    className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-400 outline-none ring-0"
                  />
                  <p className="mt-1 text-[11px] text-slate-400/90">
                    You can change your login email in the <span className="font-semibold">Login &amp; security</span> panel on the right.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="space-y-1 text-[11px]">
                  <p className="text-slate-400/90">
                    Have any questions about your account? Reach out to{" "}
                    <a
                      href="mailto:support@avillo.io"
                      className="font-semibold text-amber-100 underline-offset-2 hover:underline"
                    >
                      support@avillo.io
                    </a>
                    .
                  </p>

                  {profileSaveMessage && <p className="text-emerald-300">{profileSaveMessage}</p>}
                  {profileSaveError && <p className="text-rose-300">{profileSaveError}</p>}
                  {!profileSaveMessage && !profileSaveError && (
                    <p className="text-slate-400/90">
                      Changes won’t apply until you hit <span className="font-semibold">Save profile</span>.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleProfileSave}
                  disabled={!profileDirty || profileSaving}
                  className={cx(
                    "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition",
                    profileDirty && !profileSaving
                      ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                      : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default"
                  )}
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right column: Login & security + minimal beta note */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
                Login &amp; security
              </p>

              <button
                type="button"
                onClick={handleSignOutClick}
                className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 transition"
              >
                Sign out
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs text-slate-200/90">
              <p className="font-semibold text-slate-50">Change email</p>
              <p className="text-slate-300/90">
                Current login:{" "}
                <span className="font-mono text-amber-100">{profile?.email ?? "—"}</span>
              </p>

              <form onSubmit={handleChangeEmail} className="mt-2 space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">New email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="you@new-email.com"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">Current password</label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Required to confirm email change"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1 text-[11px]">
                    {emailSuccess && <p className="text-emerald-300">{emailSuccess}</p>}
                    {emailError && <p className="text-rose-300">{emailError}</p>}
                    {!emailSuccess && !emailError && (
                      <p className="text-slate-400/90">You’ll need to log in again with your new email.</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!changeEmailValid || emailLoading}
                    className={cx(
                      "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                      changeEmailValid && !emailLoading
                        ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                        : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default"
                    )}
                  >
                    {emailLoading ? "Updating…" : "Update email"}
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-5 border-t border-slate-800 pt-4 text-xs text-slate-200/90">
              <p className="font-semibold text-slate-50">Change password</p>

              <form onSubmit={handleChangePassword} className="mt-2 space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">Current password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">Confirm new password</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="Re-type new password"
                  />
                  {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                    <p className="mt-1 text-[11px] text-rose-300">Passwords do not match.</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1 text-[11px]">
                    {passwordSuccess && <p className="text-emerald-300">{passwordSuccess}</p>}
                    {passwordError && <p className="text-rose-300">{passwordError}</p>}
                    {!passwordSuccess && !passwordError && (
                      <p className="text-slate-400/90">
                        Use a strong password with a mix of letters, numbers, and symbols.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!changePasswordValid || passwordLoading}
                    className={cx(
                      "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                      changePasswordValid && !passwordLoading
                        ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                        : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default"
                    )}
                  >
                    {passwordLoading ? "Updating…" : "Update password"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Need support? */}
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-300/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Need support?
            </p>

            <p className="mt-2 text-slate-300/90">
              Reach out anytime — we’ll get you taken care of.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href="mailto:support@avillo.io"
                className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 transition"              >
                support@avillo.io
              </a>
              <a
                href="mailto:sales@avillo.io"
                className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 transition"
              >
                sales@avillo.io
              </a>
              <a
                href="mailto:billing@avillo.io"
                className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 transition"
              >
                billing@avillo.io
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
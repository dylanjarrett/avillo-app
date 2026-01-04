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

type ProfileResponse =
  | { success: true; user: Profile }
  | { success?: false; error: string };

function normalizePhoneInput(raw: string) {
  return raw.replace(/[^\d+]/g, "").trim();
}

function formatPhonePretty(value: string) {
  // If it's already E.164 (+1...), leave it.
  if (value.startsWith("+")) return value;

  // Basic US prettifier if 10 digits
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Profile form state (name + brokerage)
  const [nameInput, setNameInput] = useState("");
  const [brokerageInput, setBrokerageInput] = useState("");

  // Profile save status
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(
    null
  );
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

  // ------- Load profile on mount -------
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setProfileError(null);

      try {
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        const data: ProfileResponse = await res.json().catch(() => ({} as any));

        if (res.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!res.ok || !("success" in data) || !data.success) {
          if (!cancelled) {
            setProfileError(
              (data as any)?.error ?? "There was an issue loading your profile."
            );
          }
          return;
        }

        if (!cancelled) {
          setProfile(data.user);
          setSavedProfile(data.user);
          setNameInput(data.user.name ?? "");
          setBrokerageInput(data.user.brokerage ?? "");
          setPhoneInput(data.user.phone ?? "");
        }
      } catch (err) {
        console.error("Failed to load profile", err);
        if (!cancelled) {
          setProfileError("Something went wrong while loading your profile.");
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }

    void loadProfile();
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
    // Allow empty (meaning clear/remove)
    const cleaned = normalizePhoneInput(phoneInput);
    if (!cleaned) return true;

    // Accept E.164-ish: + and digits, 10-15 digits total
    const digitsOnly = cleaned.startsWith("+")
      ? cleaned.slice(1).replace(/\D/g, "")
      : cleaned.replace(/\D/g, "");

    if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;

    // If includes +, ensure it's only at the front
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
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmNewPassword;

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

      if (!res.ok) {
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
        setPhoneError(
          data?.error ?? "Something went wrong while updating your phone."
        );
        return;
      }

      // Expecting { success: true, phone: string | null } or { success: true, user: {...} }
      const nextPhone =
        typeof data?.phone !== "undefined"
          ? (data.phone as string | null)
          : (data?.user?.phone as string | null);

      setProfile((prev) => (prev ? { ...prev, phone: nextPhone ?? null } : prev));
      setSavedProfile((prev) =>
        prev ? { ...prev, phone: nextPhone ?? null } : prev
      );
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
        setEmailSuccess(
          data?.message ??
            "Email updated. You’ll be redirected to log in again."
        );
        await signOut({ callbackUrl: "/login" });
        return;
      }

      setEmailSuccess(
        data?.message ??
          "Email updated. Please sign in again with your new address."
      );

      // Optimistically update profile email
      setProfile((prev) =>
        prev ? { ...prev, email: newEmail.trim().toLowerCase() } : prev
      );
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

  // ------- Render -------

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ACCOUNT"
        title="Account settings"
        subtitle="Update your profile, brokerage details, and login preferences. This is where you’ll also manage team access once Avillo supports multiple seats."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Profile card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Profile
          </p>
          <p className="mt-2 text-xs text-slate-200/90">
            These details help personalize your outputs and enable SMS “Run now”
            testing. Outbound SMS is still sent from a shared Avillo number.
          </p>

          {loadingProfile ? (
            <p className="mt-4 text-xs text-slate-400/90">Loading profile…</p>
          ) : profileError ? (
            <p className="mt-4 text-xs text-rose-300">{profileError}</p>
          ) : (
            <>
              <div className="mt-4 space-y-3 text-xs">
                {/* Full name */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="Enter your full name"
                  />
                </div>

                {/* Brokerage / team */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Brokerage / team
                  </label>
                  <input
                    type="text"
                    value={brokerageInput}
                    onChange={(e) => setBrokerageInput(e.target.value)}
                    placeholder="Your brokerage name"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                  />
                </div>

                {/* Phone (for Run Now testing) */}
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
                      Recommended:{" "}
                      <span className="font-mono text-amber-100">+1</span> format.
                      If you enter 10 digits, Avillo will still store what you submit.
                    </p>
                    <span className="text-slate-400/80">
                      {phoneInput.trim()
                        ? `Preview: ${formatPhonePretty(phoneInput.trim())}`
                        : "—"}
                    </span>
                  </div>

                  {!phoneValid && (
                    <p className="mt-1 text-[11px] text-rose-300">
                      Enter a valid phone number (10–15 digits). You can include a leading +.
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="space-y-1 text-[11px]">
                      {phoneSuccess && (
                        <p className="text-emerald-300">{phoneSuccess}</p>
                      )}
                      {phoneError && <p className="text-rose-300">{phoneError}</p>}
                      {!phoneSuccess && !phoneError && (
                        <p className="text-slate-400/90">
                          This updates immediately and is used only for test sends.
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handlePhoneSave}
                      disabled={!phoneDirty || !phoneValid || phoneSaving}
                      className={[
                        "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition",
                        phoneDirty && phoneValid && !phoneSaving
                          ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                          : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default",
                      ].join(" ")}
                    >
                      {phoneSaving ? "Saving..." : "Save phone"}
                    </button>
                  </div>
                </div>

                {/* Login email (read-only here, changed via separate form) */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Login email
                  </label>
                  <input
                    type="email"
                    value={profile?.email ?? ""}
                    readOnly
                    className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-400 outline-none ring-0"
                  />
                  <p className="mt-1 text-[11px] text-slate-400/90">
                    You can change your login email in the{" "}
                    <span className="font-semibold">Login &amp; security</span>{" "}
                    panel on the right.
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

                  {profileSaveMessage && (
                    <p className="text-emerald-300">{profileSaveMessage}</p>
                  )}
                  {profileSaveError && (
                    <p className="text-rose-300">{profileSaveError}</p>
                  )}
                  {!profileSaveMessage && !profileSaveError && (
                    <p className="text-slate-400/90">
                      Changes won’t apply until you hit{" "}
                      <span className="font-semibold">Save profile</span>.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleProfileSave}
                  disabled={!profileDirty || profileSaving}
                  className={[
                    "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition",
                    profileDirty && !profileSaving
                      ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                      : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default",
                  ].join(" ")}
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right column: Login & security + beta note */}
        <div className="space-y-4">
          {/* Login & security card */}
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

            {/* Change email */}
            <div className="mt-3 space-y-2 text-xs text-slate-200/90">
              <p className="font-semibold text-slate-50">Change email</p>
              <p className="text-slate-300/90">
                Current login:{" "}
                <span className="font-mono text-amber-100">
                  {profile?.email ?? "—"}
                </span>
              </p>

              <form onSubmit={handleChangeEmail} className="mt-2 space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    New email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="you@new-email.com"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Current password
                  </label>
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
                    {emailSuccess && (
                      <p className="text-emerald-300">{emailSuccess}</p>
                    )}
                    {emailError && (
                      <p className="text-rose-300">{emailError}</p>
                    )}
                    {!emailSuccess && !emailError && (
                      <p className="text-slate-400/90">
                        You’ll need to log in again with your new email.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!changeEmailValid || emailLoading}
                    className={[
                      "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                      changeEmailValid && !emailLoading
                        ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                        : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default",
                    ].join(" ")}
                  >
                    {emailLoading ? "Updating…" : "Update email"}
                  </button>
                </div>
              </form>
            </div>

            {/* Change password */}
            <div className="mt-5 border-t border-slate-800 pt-4 text-xs text-slate-200/90">
              <p className="font-semibold text-slate-50">Change password</p>

              <form
                onSubmit={handleChangePassword}
                className="mt-2 space-y-2.5"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    New password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                    placeholder="Re-type new password"
                  />
                  {confirmNewPassword.length > 0 &&
                    newPassword !== confirmNewPassword && (
                      <p className="mt-1 text-[11px] text-rose-300">
                        Passwords do not match.
                      </p>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1 text-[11px]">
                    {passwordSuccess && (
                      <p className="text-emerald-300">{passwordSuccess}</p>
                    )}
                    {passwordError && (
                      <p className="text-rose-300">{passwordError}</p>
                    )}
                    {!passwordSuccess && !passwordError && (
                      <p className="text-slate-400/90">
                        Use a strong password with a mix of letters, numbers,
                        and symbols.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!changePasswordValid || passwordLoading}
                    className={[
                      "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                      changePasswordValid && !passwordLoading
                        ? "border border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
                        : "border border-slate-600 bg-slate-900/60 text-slate-500 cursor-default",
                    ].join(" ")}
                  >
                    {passwordLoading ? "Updating…" : "Update password"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Private beta note */}
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-300/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Private beta
            </p>
            <p className="mt-2">
              You’re currently in a{" "}
              <span className="font-semibold text-amber-100">
                single-seat preview
              </span>
              . As we roll out team features, this screen will expand to show
              seat invites, roles, and workspace-level settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

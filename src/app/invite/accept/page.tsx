// src/app/invite/accept/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthLogo() {
  return (
    <div className="mb-6 flex flex-col items-center">
      <Image
        src="/avillo-logo-cream.png"
        alt="Avillo"
        width={260}
        height={120}
        priority
        className="h-auto w-[220px] md:w-[260px] drop-shadow-[0_0_40px_rgba(244,210,106,0.6)]"
      />
    </div>
  );
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/**
 * After signIn, NextAuth sometimes needs a moment before the session cookie
 * is readable by middleware / server routes. This polls /api/auth/session.
 */
async function waitForSession(maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const s = await res.json().catch(() => null);
        if (s?.user) return { ok: true as const, user: s.user as any };
      }
    } catch {
      // ignore
    }
    await sleep(200 + i * 150);
  }
  return { ok: false as const, user: null as any };
}

type InviteInfo = {
  email: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  workspaceName?: string | null;
  inviterName?: string | null;
  expiresAt?: string | null;
  status?: string | null;
};

type Mode = "loading" | "signup" | "signin" | "invalid";

function prettyInviteError(msg: string) {
  const m = String(msg || "");
  if (!m) return "Something went wrong. Please try again.";

  const lower = m.toLowerCase();

  if (lower.includes("no available seats")) return "No available seats in this workspace. Ask the owner to add seats.";
  if (lower.includes("invite email does not match")) {
    return "This invite is tied to a different email. Please sign in with the invited email to accept.";
  }
  if (lower.includes("expired")) return "This invitation has expired. Ask the owner to resend it.";
  if (lower.includes("revoked")) return "This invitation was revoked. Ask the owner to send a new one.";
  if (lower.includes("not active")) return "This invitation is no longer active.";
  if (lower.includes("unauthorized")) return "Please sign in to accept this invitation.";

  return m;
}

function safeInternalPath(raw: string | null, fallback = "/dashboard") {
  const v = String(raw || "").trim();
  if (!v) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("/login") || v.startsWith("/signup")) return fallback;
  return v;
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = useMemo(() => searchParams?.get("token") || "", [searchParams]);

  // Where to go after acceptance
  const callbackUrl = useMemo(() => {
    const cb = searchParams?.get("callbackUrl");
    return safeInternalPath(cb, "/dashboard");
  }, [searchParams]);

  const [mode, setMode] = useState<Mode>("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prevents double auto-accept on rerenders
  const didAutoAcceptRef = useRef(false);

  const lockedEmail = useMemo(() => {
    return invite?.email ? normalizeEmail(invite.email) : "";
  }, [invite?.email]);

  const returnToInvite = useMemo(() => {
    // preserve token + callbackUrl (post-accept destination)
    return `/invite/accept?token=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, [token, callbackUrl]);

  function goToLogin() {
    router.replace(`/login?callbackUrl=${encodeURIComponent(returnToInvite)}`);
    router.refresh();
  }

  async function acceptInviteSignedIn() {
    const res = await withTimeout(
      fetch("/api/workspaces/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      15000,
      "Invite acceptance timed out. Please try again."
    );

    const data = await res.json().catch(() => ({} as any));

    // Success + idempotent accept
    if (res.ok && data?.ok) {
      router.replace(callbackUrl);
      router.refresh();
      return;
    }

    // Handle common deterministic failures nicely
    const status = res.status;
    const apiMsg = String(data?.error || "");

    if (status === 401) throw new Error(prettyInviteError("Unauthorized"));
    if (status === 403) throw new Error(prettyInviteError("Invite email does not match logged-in user."));
    if (status === 409) throw new Error(prettyInviteError(apiMsg || "No available seats."));

    // Legacy fallback string match (older route versions)
    if (apiMsg.toLowerCase().includes("already accepted")) {
      router.replace(callbackUrl);
      router.refresh();
      return;
    }

    throw new Error(prettyInviteError(apiMsg || "Failed to accept invite."));
  }

  // 1) Lookup invite and default to signup vs signin based on `alreadyExists` (if provided)
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!token) {
        setError("Missing invitation token.");
        setMode("invalid");
        return;
      }

      setMode("loading");
      setError(null);

      try {
        const res = await withTimeout(
          fetch(`/api/workspaces/invites/lookup?token=${encodeURIComponent(token)}`, { cache: "no-store" }),
          15000,
          "Invite lookup timed out. Please try again."
        );

        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.ok) {
          throw new Error(prettyInviteError(data?.error || "Invite not found or no longer valid."));
        }

        if (!alive) return;

        const info = data?.invite as InviteInfo | undefined;
        if (!info?.email) throw new Error("Invite is missing an email.");

        setInvite({
          email: normalizeEmail(info.email),
          role: info.role,
          workspaceName: info.workspaceName ?? null,
          inviterName: info.inviterName ?? null,
          expiresAt: info.expiresAt ?? null,
          status: info.status ?? null,
        });

        // default mode (lookup may not include alreadyExists; safest is signup)
        setMode(data?.alreadyExists ? "signin" : "signup");
      } catch (err: any) {
        if (!alive) return;
        setError(prettyInviteError(err?.message || "Could not load invite."));
        setMode("invalid");
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [token]);

  // 2) Auto-accept only when it makes sense:
  //    - user is returning from login (mode signin), OR
  //    - user is already signed in AND signed-in email matches invite email
  useEffect(() => {
    if (!token) return;
    if (mode === "invalid" || mode === "loading") return;
    if (!invite?.email) return;
    if (didAutoAcceptRef.current) return;

    (async () => {
      const s = await waitForSession(2);
      if (!s.ok) return;

      const sessionEmail = normalizeEmail(s.user?.email || "");
      const inviteEmail = normalizeEmail(invite.email);

      const canAutoAccept = mode === "signin" || (sessionEmail && sessionEmail === inviteEmail);
      if (!canAutoAccept) return;

      try {
        didAutoAcceptRef.current = true;
        await acceptInviteSignedIn();
      } catch {
        didAutoAcceptRef.current = false;
      }
    })();
  }, [token, mode, invite?.email]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!token) throw new Error("Missing invitation token.");
      if (!invite?.email) throw new Error("Invite details were not loaded yet.");

      // SIGNIN MODE: route user to login (don’t try to accept unauthenticated)
      if (mode === "signin") {
        goToLogin();
        return;
      }

      // SIGNUP MODE validations
      if (!name.trim()) throw new Error("Please enter your name.");
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

      // Create user from invite (email locked)
      const res = await withTimeout(
        fetch("/api/auth/signup-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            name: name.trim(),
            email: lockedEmail,
            password,
          }),
        }),
        15000,
        "Signup request timed out. Please try again."
      );

      const data = await res.json().catch(() => ({} as any));

      // ✅ aligned with your updated API: 409 + code ACCOUNT_EXISTS
      if (res.status === 409 && data?.code === "ACCOUNT_EXISTS") {
        setMode("signin");
        setError("Account already exists. Sign in to accept this invitation.");
        setSubmitting(false);
        return;
      }

      if (!res.ok || !data?.ok) {
        throw new Error(prettyInviteError(data?.error || "Something went wrong creating your account."));
      }

      // Sign in (credentials) without redirect
      const signInResult = await withTimeout(
        signIn("credentials", {
          redirect: false,
          email: lockedEmail,
          password,
        }),
        15000,
        "Sign-in timed out. Please try again."
      );

      if (signInResult?.error) {
        goToLogin();
        return;
      }

      // Wait for session cookie to settle
      const s = await waitForSession(6);
      if (!s.ok) {
        goToLogin();
        return;
      }

      // New user path: signup route already created membership + marked invite accepted
      // But accepting again is safe/idempotent with your accept route.
      await acceptInviteSignedIn();
    } catch (err: any) {
      setError(prettyInviteError(err?.message || "Something went wrong."));
      setSubmitting(false);
    }
  }

  const headerSubtitle =
    invite?.workspaceName
      ? `You’re joining ${invite.workspaceName}${invite.inviterName ? ` — invited by ${invite.inviterName}` : ""}.`
      : "Complete your account to accept this invite.";

  return (
    <div className="min-h-screen px-4">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center py-10">
        <AuthLogo />

        <div className="w-full rounded-3xl border border-[rgba(148,163,184,0.35)] bg-[rgba(9,13,28,0.96)] px-6 py-7 shadow-[0_0_50px_rgba(15,23,42,0.9)] backdrop-blur">
          <div className="mb-6 text-center">
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[var(--avillo-cream-muted)] uppercase">
              Invitation
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[var(--avillo-cream)]">
              Join your workspace on Avillo
            </h1>
            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">{headerSubtitle}</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/70 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
              {error}
            </div>
          )}

          {mode === "loading" ? (
            <div className="rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(9,13,28,0.55)] px-4 py-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              Loading invitation…
            </div>
          ) : mode === "invalid" || !invite ? (
            <div className="rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(9,13,28,0.55)] px-4 py-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              This invitation is invalid or expired.
              <div className="mt-2">
                <Link href="/login" className="font-medium text-[var(--avillo-cream)] hover:underline">
                  Go to sign in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <form className="space-y-3" onSubmit={handleSubmit}>
                {mode === "signup" && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                      Full name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="avillo-input w-full"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                    Work email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={lockedEmail}
                    readOnly
                    disabled
                    className="avillo-input w-full opacity-80"
                  />
                  <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                    This email is locked to your invitation.
                  </p>
                </div>

                {mode === "signup" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                      Password
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="avillo-input w-full"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(9,13,28,0.55)] px-4 py-3 text-[11px] text-[var(--avillo-cream-muted)]">
                    An account already exists for this email. Sign in to accept the invitation.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-3 flex w-full items-center justify-center rounded-full border border-[var(--avillo-cream-soft)] bg-[var(--avillo-cream)] px-4 py-2 text-[13px] font-semibold text-[#050814] shadow-[0_0_26px_rgba(244,210,106,0.35)] transition hover:bg-[#f0ebdd] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Accepting invite…" : mode === "signin" ? "Sign in to accept" : "Accept invitation"}
                </button>
              </form>

              {mode === "signup" ? (
                <p className="mt-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                    }}
                    className="font-medium text-[var(--avillo-cream)] hover:underline"
                  >
                    Sign in to accept
                  </button>
                </p>
              ) : (
                <p className="mt-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Continue to{" "}
                  <button type="button" onClick={goToLogin} className="font-medium text-[var(--avillo-cream)] hover:underline">
                    sign in
                  </button>{" "}
                  to accept.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
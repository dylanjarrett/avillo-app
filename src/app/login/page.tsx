// src/app/login/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function GoogleIcon() {
  return (
    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-white">
      <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6 1.54 7.38 2.84l5.4-5.28C33.9 3.36 29.47 1.5 24 1.5 14.82 0 7.06 6.98 4.08 14.86l6.62 5.14C12.27 14.58 17.62 9.5 24 9.5z"
        />
        <path
          fill="#FBBC05"
          d="M46.5 24.5c0-1.56-.14-3.06-.41-4.5H24v9h12.7c-.55 2.86-2.2 5.28-4.7 6.9l7.24 5.62C43.9 37.34 46.5 31.47 46.5 24.5z"
        />
        <path
          fill="#4285F4"
          d="M10.7 28.5A14.5 14.5 0 0 1 9.5 24c0-1.56.27-3.07.73-4.49l-6.62-5.14A22.4 22.4 0 0 0 1.5 24c0 3.6.86 7 2.38 10l6.82-5.5z"
        />
        <path
          fill="#34A853"
          d="M24 46.5c5.94 0 10.94-1.96 14.58-5.32l-7.24-5.62C29.4 36.74 26.9 37.5 24 37.5c-6.38 0-11.73-5.08-13.3-11.86l-6.82 5.5C7.06 41.02 14.82 46.5 24 46.5z"
        />
        <path fill="none" d="M1.5 1.5h45v45h-45z" />
      </svg>
    </span>
  );
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAccessLevel(x: unknown) {
  const s = String(x || "").toUpperCase();
  if (s === "BETA") return "BETA";
  if (s === "PAID") return "PAID";
  if (s === "EXPIRED") return "EXPIRED";
  return "UNKNOWN";
}

function safeInternalPath(raw: string | null) {
  if (!raw) return null;

  // Only allow internal paths
  if (!raw.startsWith("/")) return null;

  // Prevent redirect loops back into auth pages
  if (raw.startsWith("/login")) return null;
  if (raw.startsWith("/signup")) return null;

  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = useMemo(() => {
    const raw = searchParams?.get("callbackUrl");
    return safeInternalPath(raw);
  }, [searchParams]);

  const postLoginPath = useMemo(() => {
    const accessLevel = normalizeAccessLevel((session?.user as any)?.accessLevel);

    // ✅ your rule: EXPIRED always goes to Billing
    if (accessLevel === "EXPIRED") return "/billing?reason=upgrade_required";

    // Otherwise honor callbackUrl if present
    return callbackUrl || "/dashboard";
  }, [session, callbackUrl]);

  // ✅ if already signed in, route deterministically
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(postLoginPath);
    }
  }, [status, postLoginPath, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: normalizeEmail(email),
        password,
      });

      if (result?.error) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      // Let NextAuth session cookie settle a moment
      await new Promise((r) => setTimeout(r, 150));
      router.replace(postLoginPath);
    } catch (err: any) {
      setError(err?.message || "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    // ✅ IMPORTANT: preserve callbackUrl for invite acceptance
    // EXPIRED users will still be gated by your middleware / billing rule after auth.
    const target = callbackUrl || "/dashboard";
    await signIn("google", { callbackUrl: target });
  }

  return (
    <div className="min-h-screen px-4">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center py-10">
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

        <div className="w-full rounded-3xl border border-[rgba(148,163,184,0.35)] bg-[rgba(9,13,28,0.96)] px-6 py-7 shadow-[0_0_50px_rgba(15,23,42,0.9)] backdrop-blur">
          <div className="mb-6 text-center">
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[var(--avillo-cream-muted)] uppercase">
              Welcome back
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[var(--avillo-cream)]">
              Sign in to Avillo
            </h1>

            {callbackUrl?.startsWith("/invite/accept") && (
              <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                Sign in to accept your workspace invitation.
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/70 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
              {error}
            </div>
          )}

          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(normalizeEmail(e.target.value))}
                placeholder="you@example.com"
                className="avillo-input w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="avillo-input w-full"
              />

              <div className="mt-1 flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-[10px] font-medium text-[var(--avillo-cream-soft)] hover:text-[var(--avillo-cream)]"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 flex w-full items-center justify-center rounded-full border border-[var(--avillo-cream-soft)] bg-[var(--avillo-cream)] px-4 py-2 text-[13px] font-semibold text-[#050814] shadow-[0_0_26px_rgba(244,210,106,0.35)] transition hover:bg-[#f0ebdd] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-[10px] text-[var(--avillo-cream-muted)]">
            <div className="h-px flex-1 bg-[rgba(148,163,184,0.35)]" />
            <span>or</span>
            <div className="h-px flex-1 bg-[rgba(148,163,184,0.35)]" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center rounded-full border border-[rgba(148,163,184,0.6)] bg-transparent px-4 py-2 text-[12px] font-medium text-[var(--avillo-cream)] transition hover:border-[var(--avillo-gold)] hover:bg-[rgba(15,23,42,0.9)]"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="mt-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
            New to Avillo?{" "}
            <Link href="/signup" className="font-medium text-[var(--avillo-cream)] hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
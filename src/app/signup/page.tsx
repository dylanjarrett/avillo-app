// src/app/signup/page.tsx
"use client";

import { FormEvent, useMemo, useState } from "react";
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
  return value.trim().toLowerCase();
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
        if (s?.user) return true;
      }
    } catch {
      // ignore
    }
    await sleep(200 + i * 150); // backoff
  }
  return false;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = useMemo(() => {
    const cb = searchParams?.get("callbackUrl");
    return cb && cb.startsWith("/") ? cb : "/dashboard";
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const normalizedEmail = normalizeEmail(email);

    // ✅ Your rule: new users are EXPIRED and must go to Billing.
    const billingUrl =
      `/billing?reason=upgrade_required&callbackUrl=${encodeURIComponent(callbackUrl)}`;

    try {
      // 1) Create the user
      const res = await withTimeout(
        fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            brokerage: brokerage || undefined,
            email: normalizedEmail,
            password,
          }),
        }),
        15000,
        "Signup request timed out. Please try again."
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong creating your account.");
      }

      // 2) Sign in WITHOUT redirect (avoid NextAuth redirect race)
      const signInResult = await withTimeout(
        signIn("credentials", {
          redirect: false,
          email: normalizedEmail,
          password,
        }),
        15000,
        "Sign-in timed out. Please try again."
      );

      if (signInResult?.error) {
        // fallback: send to login, but still force billing after
        router.replace(`/login?callbackUrl=${encodeURIComponent(billingUrl)}`);
        router.refresh();
        return;
      }

      // 3) ✅ Session settle (prevents “stuck” / middleware reading no-cookie)
      const ok = await waitForSession(6);
      if (!ok) {
        // still don’t hang — just go to login with billing callback
        router.replace(`/login?callbackUrl=${encodeURIComponent(billingUrl)}`);
        router.refresh();
        return;
      }

      // 4) Go to billing
      router.replace(billingUrl);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
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
              Get started
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[var(--avillo-cream)]">
              Create your Avillo account
            </h1>
            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
              You’ll use this login to access your Intelligence tools and CRM.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/70 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
              {error}
            </div>
          )}

          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Full name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dylan Jarrett"
                className="avillo-input w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Brokerage (optional)
              </label>
              <input
                value={brokerage}
                onChange={(e) => setBrokerage(e.target.value)}
                placeholder="Compass, Coldwell, independent…"
                className="avillo-input w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Work email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(normalizeEmail(e.target.value))}
                placeholder="you@yourbrokerage.com"
                className="avillo-input w-full"
              />
            </div>

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

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 flex w-full items-center justify-center rounded-full border border-[var(--avillo-cream-soft)] bg-[var(--avillo-cream)] px-4 py-2 text-[13px] font-semibold text-[#050814] shadow-[0_0_26px_rgba(244,210,106,0.35)] transition hover:bg-[#f0ebdd] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] text-[var(--avillo-cream-muted)]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[var(--avillo-cream)] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
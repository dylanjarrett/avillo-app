// src/app/signup/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedName = name.trim();

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          name: trimmedName,
        }),
      });

      if (!res.ok) {
        let message = "Failed to create account.";
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      // After successful signup, log them in via credentials
      const login = await signIn("credentials", {
        redirect: false,
        email: trimmedEmail,
        password,
        callbackUrl: "/dashboard",
      });

      if (login?.error) {
        setError(login.error);
      } else if (login?.ok) {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      console.error("Signup failed:", err);
      setError(err?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSocial(provider: "google" | "apple") {
    await signIn(provider, { callbackUrl: "/dashboard" });
  }

  return (
    <main className="min-h-screen bg-[#050814] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src="/avillo-logo-wordmark.png"
            alt="Avillo"
            className="w-[220px] max-w-full h-auto"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0A0C14]/95 p-6 shadow-[0_0_30px_rgba(0,0,0,0.7)]">
          <h1 className="text-xl font-semibold mb-1">
            Create your Avillo account
          </h1>
          <p className="text-xs text-[#AAB4C0] mb-6">
            Your AI Advantage in Real Estate
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#AAB4C0] mb-1">
                Name
              </label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg bg-[#101321] border border-white/15 p-2.5 text-xs text-white placeholder-[#6B7280] focus:border-[#1A73E8] focus:outline-none"
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#AAB4C0] mb-1">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-[#101321] border border-white/15 p-2.5 text-xs text-white placeholder-[#6B7280] focus:border-[#1A73E8] focus:outline-none"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#AAB4C0] mb-1">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-[#101321] border border-white/15 p-2.5 text-xs text-white placeholder-[#6B7280] focus:border-[#1A73E8] focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-[#1A73E8] py-2.5 text-xs font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] hover:bg-[#1557B0] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="px-3 text-[10px] uppercase tracking-[0.2em] text-[#6B7280]">
              OR
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Social buttons */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleSocial("google")}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#050814] py-2.5 text-xs text-[#E5E7EB] hover:border-[#1A73E8] transition"
            >
              <GoogleIcon />
              <span>Sign up with Google</span>
            </button>

            <button
              type="button"
              onClick={() => handleSocial("apple")}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#050814] py-2.5 text-xs text-[#E5E7EB] hover:border-[#1A73E8] transition"
            >
              <AppleIcon />
              <span>Sign up with Apple</span>
            </button>
          </div>

          <p className="mt-4 text-[11px] text-[#AAB4C0] text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-[#4D9FFF] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

/* Inline icons */

function GoogleIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-white">
      <span className="text-[12px] font-bold text-[#4285F4]">G</span>
    </span>
  );
}

function AppleIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 fill-current text-white"
      >
        <path d="M18.71 13.34c-.03-2.27 1.86-3.35 1.95-3.4-1.07-1.56-2.73-1.77-3.31-1.79-1.4-.15-2.74.82-3.45.82-.72 0-1.81-.8-2.98-.78-1.53.02-2.95.89-3.74 2.25-1.61 2.79-.41 6.91 1.15 9.17.76 1.09 1.66 2.3 2.84 2.26 1.15-.05 1.58-.73 2.96-.73 1.38 0 1.76.73 2.98.71 1.24-.02 2.03-1.112.79-2.22.88-1.29 1.25-2.551.27-2.61-.03-.01-2.44-.94-2.47-3.68z" />
        <path d="M15.62 5.34c.63-.76 1.06-1.81.95-2.86-.92.04-2.01.61-2.66 1.37-.58.67-1.09 1.79-.96 2.83.99.08 2.01-.5 2.67-1.34z" />
      </svg>
    </span>
  );
}
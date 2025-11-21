// src/app/account/AccountForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AccountFormProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    brokerage: string | null;
  };
}

export default function AccountForm({ user }: AccountFormProps) {
  const [name, setName] = useState(user.name ?? "");
  const [brokerage, setBrokerage] = useState(user.brokerage ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brokerage }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save changes");
      }

      setMessage("Saved");
      router.refresh();
    } catch (err: any) {
      setMessage(err?.message || "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-400"
          />
          <p className="text-xs text-slate-500">
            Email comes from Google sign-in and can’t be changed here.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Dylan Jarrett"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
          Brokerage
        </label>
        <input
          type="text"
          value={brokerage}
          onChange={(e) => setBrokerage(e.target.value)}
          placeholder="e.g., Compass, eXp, Keller Williams"
          className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {message && (
        <p
          className={`text-sm ${
            message === "Saved" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {message}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Changes apply immediately across your Avillo workspace.
        </p>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
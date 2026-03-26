// src/components/auth/session-guard.tsx
"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

const CHECK_INTERVAL_MS = 15_000;

function buildLoginUrl() {
  if (typeof window === "undefined") {
    return "/login?reason=session_expired";
  }

  const callbackUrl = `${window.location.pathname}${window.location.search || ""}`;
  return `/login?reason=session_expired&callbackUrl=${encodeURIComponent(
    callbackUrl || "/dashboard"
  )}`;
}

export default function SessionGuard() {
  const checkingRef = useRef(false);
  const handledRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function handleExpiredSession() {
      if (handledRef.current) return;
      handledRef.current = true;

      const callbackUrl = buildLoginUrl();

      try {
        await signOut({ callbackUrl });
      } catch (err) {
        console.error("[SessionGuard] signOut failed:", err);

        if (typeof window !== "undefined") {
          window.location.href = callbackUrl;
        }
      }
    }

    async function runCheck() {
      if (!mounted) return;
      if (checkingRef.current) return;
      if (handledRef.current) return;

      checkingRef.current = true;

      try {
        const res = await fetch("/api/auth/check", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: {
            "Cache-Control": "no-store",
          },
        });

        if (!mounted || handledRef.current) return;

        if (res.status === 401) {
          await handleExpiredSession();
        }
      } catch (err) {
        console.error("[SessionGuard] auth check failed:", err);
      } finally {
        checkingRef.current = false;
      }
    }

    function handleFocus() {
      void runCheck();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void runCheck();
      }
    }

    void runCheck();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = window.setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
// src/hooks/useCommsMobileWorkspaceScroll.ts
"use client";

import { useEffect, useRef } from "react";

function isMobileNow() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 1024;
}

/**
 * Comms-only mobile scroll behavior (no BODY lock):
 * - On mobile, when opening a thread:
 *   - capture current window scroll position
 *   - (optionally) scroll the detail panel into view
 * - On back:
 *   - restore scroll position to where the list was
 *
 * Notes:
 * - We intentionally DO NOT lock <body> scroll. Locking breaks global nav visibility
 *   and prevents natural page scrolling on mobile.
 * - All “bounce/background scroll” control should be handled inside the thread’s
 *   own scroll container via CSS (e.g., overscroll-contain), not by freezing the page.
 */
export function useCommsMobileWorkspaceScroll() {
  const listHeaderRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const lastWindowScrollYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  function getScrollY() {
    if (typeof window === "undefined") return 0;
    // Safari sometimes reports body scroll weirdly; documentElement is safer fallback.
    return (
      window.scrollY ||
      document.documentElement?.scrollTop ||
      (document.body as any)?.scrollTop ||
      0
    );
  }

  function setScrollY(y: number) {
    if (typeof window === "undefined") return;
    window.scrollTo(0, Math.max(0, Math.floor(y || 0)));
  }

  function cancelPendingRAF() {
    if (typeof window === "undefined") return;
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }

  function scrollToWorkspace() {
    if (typeof window === "undefined") return;
    if (!isMobileNow()) return;

    // Save scroll position for "Back"
    lastWindowScrollYRef.current = getScrollY();

    cancelPendingRAF();

    // Let the caller flip DOM (workspaceOpenMobile) then scroll
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;

      const el = workspaceRef.current;
      if (el) {
        // scrollIntoView is better than window.scrollTo for dynamic layouts
        el.scrollIntoView({ block: "start" });
      }

      // ✅ No body lock — page scroll + navbar remain usable
    });
  }

  function scrollBackToListHeader(after?: () => void) {
    if (typeof window === "undefined") return;

    // Restore to the saved list scroll position on mobile
    if (isMobileNow()) {
      cancelPendingRAF();
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        setScrollY(lastWindowScrollYRef.current || 0);
        after?.();
      });
      return;
    }

    after?.();
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelPendingRAF();
    };
  }, []);

  return {
    listHeaderRef,
    workspaceRef,
    scrollToWorkspace,
    scrollBackToListHeader,
  };
}
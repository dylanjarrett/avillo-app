// src/hooks/useCommsMobileWorkspaceScroll.ts
"use client";

import { useEffect, useRef } from "react";

function isMobileNow() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 1024;
}

/**
 * Comms-only mobile scroll behavior (bulletproof):
 * - On mobile, when opening a thread:
 *   - capture current scroll position
 *   - scroll the detail panel into view
 *   - lock BODY scroll (prevents iOS bounce + background scroll)
 * - On back:
 *   - unlock BODY scroll
 *   - restore scroll position to where the list was
 *
 * Hardening:
 * - idempotent lock/unlock
 * - uses documentElement scroll as fallback (Safari edge cases)
 * - compensates for fixed-body positioning with negative top
 * - unlocks on resize/orientationchange/pagehide/visibilitychange to avoid “stuck body”
 */
export function useCommsMobileWorkspaceScroll() {
  const listHeaderRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const lastWindowScrollYRef = useRef<number>(0);

  const bodyLockRef = useRef<{
    locked: boolean;
    scrollY: number;

    // saved inline styles
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
    touchAction: string;

    // extra hardening (some browsers need html overflow locked too)
    htmlOverflow: string;
    htmlOverscrollBehavior: string;

    // in-flight raf id so we can cancel
    rafId: number | null;
  }>({
    locked: false,
    scrollY: 0,

    position: "",
    top: "",
    left: "",
    right: "",
    width: "",
    overflow: "",
    touchAction: "",

    htmlOverflow: "",
    htmlOverscrollBehavior: "",

    rafId: null,
  });

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
    // using window.scrollTo is the most reliable cross-browser
    window.scrollTo(0, Math.max(0, Math.floor(y || 0)));
  }

  function cancelPendingRAF() {
    if (typeof window === "undefined") return;
    const state = bodyLockRef.current;
    if (state.rafId != null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function lockBodyScroll() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (!isMobileNow()) return;

    const state = bodyLockRef.current;
    if (state.locked) return;

    cancelPendingRAF();

    const body = document.body;
    const html = document.documentElement;

    state.locked = true;
    state.scrollY = getScrollY();

    // Save current inline styles
    state.position = body.style.position;
    state.top = body.style.top;
    state.left = body.style.left;
    state.right = body.style.right;
    state.width = body.style.width;
    state.overflow = body.style.overflow;
    state.touchAction = (body.style as any).touchAction || "";

    state.htmlOverflow = html.style.overflow;
    state.htmlOverscrollBehavior = (html.style as any).overscrollBehavior || "";

    // Lock scroll without jump:
    // - fixed body with negative top holds the visual position
    // - lock html overflow too (prevents background scroll on some iOS versions)
    body.style.position = "fixed";
    body.style.top = `-${state.scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    (body.style as any).touchAction = "none";

    html.style.overflow = "hidden";
    (html.style as any).overscrollBehavior = "none";
  }

  function unlockBodyScroll(opts?: { restoreScroll?: boolean }) {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    const state = bodyLockRef.current;
    if (!state.locked) return;

    cancelPendingRAF();

    const body = document.body;
    const html = document.documentElement;

    // Grab the scrollY that was captured at lock time
    const y = state.scrollY;

    // Restore styles (exactly)
    body.style.position = state.position;
    body.style.top = state.top;
    body.style.left = state.left;
    body.style.right = state.right;
    body.style.width = state.width;
    body.style.overflow = state.overflow;
    (body.style as any).touchAction = state.touchAction;

    html.style.overflow = state.htmlOverflow;
    (html.style as any).overscrollBehavior = state.htmlOverscrollBehavior;

    state.locked = false;

    // Restore scroll after styles are restored (avoid iOS weirdness)
    if (opts?.restoreScroll !== false) {
      // rAF ensures layout has applied before scroll restore
      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        setScrollY(y);
      });
    }
  }

  function scrollToWorkspace() {
    if (typeof window === "undefined") return;
    if (!isMobileNow()) return;

    // Save scroll position for "Back"
    lastWindowScrollYRef.current = getScrollY();

    cancelPendingRAF();

    // Let the caller flip DOM (workspaceOpenMobile) then scroll
    bodyLockRef.current.rafId = requestAnimationFrame(() => {
      bodyLockRef.current.rafId = null;

      const el = workspaceRef.current;
      if (el) {
        // scrollIntoView is better than window.scrollTo for dynamic layouts
        el.scrollIntoView({ block: "start" });
      }

      // Lock AFTER we moved into detail (prevents bounce + accidental bg scroll)
      lockBodyScroll();
    });
  }

  function scrollBackToListHeader(after?: () => void) {
    if (typeof window === "undefined") return;

    // Unlock first (restores to the lock scrollY)
    unlockBodyScroll({ restoreScroll: true });

    // If we never locked (desktop/edge cases), restore to saved list scroll
    if (isMobileNow()) {
      cancelPendingRAF();
      bodyLockRef.current.rafId = requestAnimationFrame(() => {
        bodyLockRef.current.rafId = null;
        setScrollY(lastWindowScrollYRef.current || 0);
        after?.();
      });
      return;
    }

    after?.();
  }

  // Safety: if user rotates / resizes to desktop while locked, unlock
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onResize = () => {
      const state = bodyLockRef.current;
      if (state.locked && !isMobileNow()) unlockBodyScroll();
    };

    const onOrientationChange = () => {
      const state = bodyLockRef.current;
      if (state.locked && !isMobileNow()) unlockBodyScroll();
    };

    // If the page is going away / backgrounded while locked, unlock to avoid “stuck body”
    const onPageHide = () => {
      unlockBodyScroll();
    };

    const onVisibilityChange = () => {
      // If the tab is hidden while locked, unlock immediately (Safari/iOS can get stuck)
      if (document.visibilityState === "hidden") unlockBodyScroll();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientationChange);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientationChange);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount (prevents “stuck body”)
  useEffect(() => {
    return () => {
      unlockBodyScroll();
      cancelPendingRAF();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    listHeaderRef,
    workspaceRef,
    scrollToWorkspace,
    scrollBackToListHeader,
  };
}
// src/hooks/useTasksMobileWorkspaceScroll.ts
"use client";

import { useCallback, useRef } from "react";

export function useTasksMobileWorkspaceScroll() {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const lastListScrollYRef = useRef<number>(0);

  const captureListScrollY = useCallback(() => {
    if (typeof window === "undefined") return;
    lastListScrollYRef.current = window.scrollY || 0;
  }, []);

  const scrollToWorkspaceTop = useCallback(() => {
    if (typeof window === "undefined") return;
    // small delay helps when layout toggles list/workspace visibility
    window.setTimeout(() => {
      const node = workspaceRef.current;
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 40);
  }, []);

  const scrollBackToLastListPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const y = lastListScrollYRef.current || 0;
    window.setTimeout(() => {
      window.scrollTo({ top: y, behavior: "smooth" });
    }, 40);
  }, []);

  return {
    workspaceRef,
    captureListScrollY,
    scrollToWorkspaceTop,
    scrollBackToLastListPosition,
  };
}
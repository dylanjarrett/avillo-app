// src/hooks/useListingsMobileWorkspaceScroll.ts
import { useRef, useCallback } from "react";

export function useListingsMobileWorkspaceScroll() {
  const lastListYRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < 1024;

  // Call right before opening the workspace (from list)
  const captureListScrollY = useCallback(() => {
    if (!isMobile()) return;
    lastListYRef.current = window.scrollY;
  }, []);

  // Call after workspace is opened/visible
  const scrollToWorkspaceTop = useCallback(() => {
    if (!isMobile() || !workspaceRef.current) return;

    requestAnimationFrame(() => {
      workspaceRef.current!.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  // Call on Back / Save / Delete from workspace
  const scrollBackToLastListPosition = useCallback(() => {
    if (!isMobile()) return;

    const y = lastListYRef.current ?? 0;
    lastListYRef.current = null;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: y,
        behavior: "smooth",
      });
    });
  }, []);

  return {
    workspaceRef,
    captureListScrollY,
    scrollToWorkspaceTop,
    scrollBackToLastListPosition,
  };
}
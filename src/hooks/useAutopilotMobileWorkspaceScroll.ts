"use client";

import { useRef, useCallback } from "react";

type Options = {
  downOffset?: number;
  upOffset?: number;
};

const DEFAULT_DOWN_OFFSET = 95;  // scroll INTO builder
const DEFAULT_UP_OFFSET = 340;   // match CRM Save/Delete landing zone

export function useAutopilotMobileWorkspaceScroll(options: Options = {}) {
  const {
    downOffset = DEFAULT_DOWN_OFFSET,
    upOffset = DEFAULT_UP_OFFSET,
  } = options;

  const listHeaderRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < 1024;

  const scrollToWorkspace = useCallback(() => {
    if (!isMobile() || !workspaceRef.current) return;

    requestAnimationFrame(() => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - downOffset;

      window.scrollTo({
        top: targetY,
        behavior: "smooth",
      });
    });
  }, [downOffset]);

  const scrollBackToListHeader = useCallback(
    (afterStateUpdate?: () => void) => {
      if (!isMobile()) {
        afterStateUpdate?.();
        return;
      }

      afterStateUpdate?.();

      requestAnimationFrame(() => {
        if (!listHeaderRef.current) return;
        const rect = listHeaderRef.current.getBoundingClientRect();
        const targetY = window.scrollY + rect.top - upOffset;

        window.scrollTo({
          top: targetY,
          behavior: "smooth",
        });
      });
    },
    [upOffset]
  );

  return {
    listHeaderRef,
    workspaceRef,
    scrollToWorkspace,
    scrollBackToListHeader,
  };
}
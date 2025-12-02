// src/hooks/useCrmMobileWorkspaceScroll.ts
"use client";

import { useRef, useCallback } from "react";

type Options = {
  downOffset?: number; // how far below the top the detail panel should land
  upOffset?: number;   // how far below the top the list header should land
};

const DEFAULT_DOWN_OFFSET = 95;  // tweak if you want it higher/lower
const DEFAULT_UP_OFFSET = 280;   // tweak if you want to see more / less above

export function useCrmMobileWorkspaceScroll(options: Options = {}) {
  const {
    downOffset = DEFAULT_DOWN_OFFSET,
    upOffset = DEFAULT_UP_OFFSET,
  } = options;

  const listHeaderRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < 1024;

  const scrollToDetail = useCallback(() => {
  if (!isMobile() || !detailRef.current) return;

  requestAnimationFrame(() => {
    if (!detailRef.current) return;
    const rect = detailRef.current.getBoundingClientRect();
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

      // apply state changes first (clear selection, etc.)
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
    workspaceRef: detailRef,
    scrollToWorkspace: scrollToDetail,
    scrollBackToListHeader,
  };
}
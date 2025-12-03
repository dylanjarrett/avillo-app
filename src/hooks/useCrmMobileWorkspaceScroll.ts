"use client";

import { useRef, useCallback } from "react";

type Options = {
  downOffset?: number; 
  upOffset?: number;
};

const DEFAULT_DOWN_OFFSET = 95;     // good for scrolling INTO detail
const DEFAULT_UP_OFFSET = 480;      // UPDATED — fixes Save/Delete landing zone

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
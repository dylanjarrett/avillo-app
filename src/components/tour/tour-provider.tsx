// components/tour/tour-provider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type TourKey = "dashboard";

type TourContextValue = {
  startTour: (key?: TourKey) => void;
  stopTour: () => void;
  isTourActive: boolean;
};

const TourContext = createContext<TourContextValue | null>(null);

type AttachSide = "top" | "bottom" | "left" | "right";

type TourStep = {
  id: string;
  title: string;
  text: string;
  attachTo: { element: string; on: AttachSide };
  offsetX?: number;
  offsetY?: number;

  // Keep sidebar crisp (not dimmed) during this step
  undimSidebar?: boolean;
};

function elExists(selector: string) {
  if (!selector) return false;
  return typeof document !== "undefined" && !!document.querySelector(selector);
}

function safeSteps(raw: TourStep[]) {
  return raw.filter((s) => {
    const selector = s.attachTo?.element;
    if (!selector) return true;
    return elExists(selector);
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getEl(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(selector) as HTMLElement | null;
}

type TooltipPos = { top: number; left: number; side: AttachSide };

function computeTooltipPosition(
  targetRect: DOMRect,
  tooltipRect: DOMRect,
  side: AttachSide,
  offsetX = 0,
  offsetY = 0
): TooltipPos {
  const gap = 12;

  let top = 0;
  let left = 0;

  if (side === "bottom") {
    top = targetRect.bottom + gap;
    left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  } else if (side === "top") {
    top = targetRect.top - gap - tooltipRect.height;
    left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  } else if (side === "right") {
    top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
    left = targetRect.right + gap;
  } else if (side === "left") {
    top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
    left = targetRect.left - gap - tooltipRect.width;
  }

  top += offsetY;
  left += offsetX;

  const pad = 10;
  const maxLeft = window.innerWidth - tooltipRect.width - pad;
  const maxTop = window.innerHeight - tooltipRect.height - pad;

  left = clamp(left, pad, maxLeft);
  top = clamp(top, pad, maxTop);

  return { top, left, side };
}

function findSidebarContainerFromTarget(target: HTMLElement | null) {
  if (!target) return null;

  // Prefer <aside>
  const aside = target.closest("aside") as HTMLElement | null;
  if (aside) return aside;

  // Fallback: walk up looking for sidebar/nav containers
  let el: HTMLElement | null = target;
  for (let i = 0; i < 12 && el; i++) {
    const cls = (el.className || "").toString().toLowerCase();
    const id = (el.id || "").toLowerCase();
    if (cls.includes("sidebar") || id.includes("sidebar") || cls.includes("nav")) return el;
    el = el.parentElement;
  }
  return null;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [isTourActive, setIsTourActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const stepsRef = useRef<TourStep[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ top: 100, left: 100, side: "bottom" });

  // Sidebar lift (keeps sidebar undimmed)
  const liftedSidebarRef = useRef<HTMLElement | null>(null);

  function clearLiftedSidebar() {
    const el = liftedSidebarRef.current;
    if (!el) return;

    el.classList.remove("avillo-tour-lifted");

    const prev = el.dataset.avilloTourLiftPrev;
    if (prev) {
      try {
        const s = JSON.parse(prev);
        el.style.position = s.position;
        el.style.zIndex = s.zIndex;
      } catch {}
      delete el.dataset.avilloTourLiftPrev;
    }

    liftedSidebarRef.current = null;
  }

  function liftSidebar(target: HTMLElement | null) {
    const sidebar = findSidebarContainerFromTarget(target);
    if (!sidebar) return;

    if (!sidebar.dataset.avilloTourLiftPrev) {
      sidebar.dataset.avilloTourLiftPrev = JSON.stringify({
        position: sidebar.style.position || "",
        zIndex: sidebar.style.zIndex || "",
      });
    }

    sidebar.classList.add("avillo-tour-lifted");
    liftedSidebarRef.current = sidebar;
  }

  function stopTour() {
    clearLiftedSidebar();
    setIsTourActive(false);
    setStepIndex(0);
  }

  function startTour(key: TourKey = "dashboard") {
    const isDashboard = pathname === "/dashboard" || pathname === "/" || key === "dashboard";
    if (!isDashboard) return;

    // ✅ Sidebar-only tour
    const rawSteps: TourStep[] = [
      {
        id: "nav-dashboard",
        title: "Dashboard",
        text: "This is where your day starts — what’s moving, what needs attention, and what Avillo is handling for you.",
        attachTo: { element: "#tour-nav-dashboard", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
      {
        id: "nav-intelligence",
        title: "Intelligence",
        text: "AI tools built to save time and keep you ahead.",
        attachTo: { element: "#tour-nav-intelligence", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
      {
        id: "nav-people",
        title: "People",
        text: "Your relationship portal — lightweight CRM done right.",
        attachTo: { element: "#tour-nav-people", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
      {
        id: "nav-listings",
        title: "Listings",
        text: "Manage your listings and the contacts tied to each deal.",
        attachTo: { element: "#tour-nav-listings", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
      {
        id: "nav-autopilot",
        title: "Autopilot",
        text: "Automate the repetition. Stay in control.",
        attachTo: { element: "#tour-nav-autopilot", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
      {
        id: "nav-tasks",
        title: "Tasks",
        text: "Track what matters — open items, due dates, and follow-ups tied to contacts and listings.",
        attachTo: { element: "#tour-nav-tasks", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
      {
        id: "nav-hub",
        title: "Hub",
        text: "Your workspace hub — DMs, mentions, and a shared board for fast team context.",
        attachTo: { element: "#tour-nav-hub", on: "right" },
        offsetX: 0,
        undimSidebar: true,
      },
    ];

    const finalSteps = safeSteps(rawSteps);
    if (finalSteps.length === 0) return;

    stepsRef.current = finalSteps;
    setStepIndex(0);
    setIsTourActive(true);
  }

  const currentStep = isTourActive ? stepsRef.current[stepIndex] : null;
  const isFirst = stepIndex === 0;
  const isLast = !!currentStep && stepIndex === stepsRef.current.length - 1;

  function next() {
    const steps = stepsRef.current;
    if (!steps.length) return;
    if (stepIndex >= steps.length - 1) stopTour();
    else setStepIndex((i) => i + 1);
  }

  function back() {
    if (stepIndex <= 0) return;
    setStepIndex((i) => i - 1);
  }

  // Position tooltip + keep sidebar undimmed
  useEffect(() => {
    if (!isTourActive || !currentStep) return;

    const position = () => {
      const t = getEl(currentStep.attachTo.element);
      const tip = tooltipRef.current;
      if (!t || !tip) return;

      // ✅ Ensure sidebar is ALWAYS undimmed for these steps
      clearLiftedSidebar();
      if (currentStep.undimSidebar) liftSidebar(t);

      // Tooltip sizing
      tip.style.height = "auto";
      tip.style.minHeight = "unset";
      tip.style.maxHeight = "min(260px, calc(100vh - 20px))";

      const targetRect = t.getBoundingClientRect();
      const tooltipRect = tip.getBoundingClientRect();

      const pos = computeTooltipPosition(
        targetRect,
        tooltipRect,
        currentStep.attachTo.on,
        currentStep.offsetX ?? 0,
        currentStep.offsetY ?? 0
      );

      setTooltipPos(pos);
    };

    const raf = requestAnimationFrame(() => position());
    const onResize = () => position();
    const onScroll = () => position();

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isTourActive, currentStep?.id, stepIndex]);

  // ESC closes / arrows navigate
  useEffect(() => {
    if (!isTourActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopTour();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, stepIndex]);

  const value = useMemo(
    () => ({
      startTour,
      stopTour,
      isTourActive,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTourActive, pathname]
  );

  return (
    <TourContext.Provider value={value}>
      {children}

      {isTourActive ? (
        <>
          {/* ✅ Full-page dimmer (no spotlight). Sidebar stays crisp via lift. */}
          <div className="avillo-tour-dimmer" aria-hidden="true" onClick={stopTour} />

          {/* Tooltip */}
          {currentStep ? (
            <div
              ref={tooltipRef}
              className="avillo-tour-card"
              style={{ top: tooltipPos.top, left: tooltipPos.left }}
              role="dialog"
              aria-label="Avillo tour"
            >
              <div className="avillo-tour-header">
                <div className="avillo-tour-title">{currentStep.title}</div>

                <button className="avillo-tour-x" onClick={stopTour} aria-label="Close tour">
                  ×
                </button>
              </div>

              <div className="avillo-tour-body">
                <p className="avillo-tour-text">{currentStep.text}</p>
              </div>

              <div className="avillo-tour-footer">
                <div className="avillo-tour-progress">
                  {stepIndex + 1} / {stepsRef.current.length}
                </div>

                <div className="avillo-tour-actions">
                  {!isFirst ? (
                    <button className="avillo-btn-secondary" onClick={back}>
                      Back
                    </button>
                  ) : (
                    <button className="avillo-btn-secondary" onClick={stopTour}>
                      Skip
                    </button>
                  )}

                  <button className="avillo-btn-primary" onClick={next}>
                    {isLast ? "Done" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <style jsx global>{`
            /* -----------------------------
               AVILLO TOUR: Sidebar-only
               Dim entire page EXCEPT sidebar
            ------------------------------ */

            .avillo-tour-dimmer {
              position: fixed;
              inset: 0;
              width: 100vw;
              height: 100vh;
              background: rgba(2, 6, 23, 0.62);
              z-index: 9990;
              pointer-events: auto;
            }

            /* ✅ Lift the whole sidebar above dimmer so it stays undimmed */
            .avillo-tour-lifted {
              position: relative !important;
              z-index: 9992 !important;
            }

            /* Tooltip */
            .avillo-tour-card {
              position: fixed;
              width: min(360px, calc(100vw - 20px));
              max-width: 360px;
              height: auto !important;
              min-height: unset !important;
              max-height: min(260px, calc(100vh - 20px));
              display: flex;
              flex-direction: column;
              border-radius: 18px;
              border: 1px solid rgba(148, 163, 184, 0.26);
              background: radial-gradient(circle at top, rgba(148, 163, 184, 0.14), transparent 62%),
                rgba(5, 8, 21, 0.98);
              box-shadow: 0 0 70px rgba(15, 23, 42, 0.92), 0 0 0 1px rgba(15, 23, 42, 0.7);
              color: #f5f2e8;
              z-index: 9999;
              pointer-events: auto;
              padding: 14px;
              gap: 10px;
              will-change: transform, opacity;
              transition: transform 220ms ease, opacity 160ms ease;
            }

            .avillo-tour-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 10px;
            }

            .avillo-tour-title {
              font-size: 12px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: var(--avillo-cream-muted);
              font-weight: 800;
              line-height: 1.2;
            }

            .avillo-tour-x {
              appearance: none;
              border: 1px solid rgba(148, 163, 184, 0.26);
              background: rgba(15, 23, 42, 0.28);
              color: rgba(245, 242, 232, 0.9);
              width: 28px;
              height: 28px;
              border-radius: 10px;
              font-size: 18px;
              line-height: 1;
              cursor: pointer;
              transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
              flex: 0 0 auto;
            }
            .avillo-tour-x:hover {
              border-color: rgba(242, 235, 221, 0.55);
              background: rgba(15, 23, 42, 0.45);
              transform: translateY(-1px);
            }

            .avillo-tour-body {
              overflow: auto;
              max-height: 150px;
              padding-right: 6px;
            }

            .avillo-tour-text {
              margin: 0;
              font-size: 12px;
              line-height: 1.45;
              color: var(--avillo-cream);
            }

            .avillo-tour-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding-top: 2px;
            }

            .avillo-tour-progress {
              font-size: 10px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: rgba(163, 176, 208, 0.7);
              font-weight: 700;
              white-space: nowrap;
            }

            .avillo-tour-actions {
              display: flex;
              gap: 10px;
            }

            .avillo-btn-primary {
              border-radius: 12px;
              border: 1px solid rgba(242, 235, 221, 0.55);
              background: rgba(242, 235, 221, 0.1);
              color: var(--avillo-cream);
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              padding: 10px 12px;
              box-shadow: 0 0 18px rgba(242, 235, 221, 0.18);
              cursor: pointer;
              transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
            }

            .avillo-btn-primary:hover {
              border-color: rgba(242, 235, 221, 0.75);
              background: rgba(242, 235, 221, 0.14);
              transform: translateY(-1px);
            }

            .avillo-btn-secondary {
              border-radius: 12px;
              border: 1px solid rgba(148, 163, 184, 0.26);
              background: rgba(15, 23, 42, 0.32);
              color: rgba(245, 242, 232, 0.9);
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              padding: 10px 12px;
              cursor: pointer;
            }
          `}</style>
        </>
      ) : null}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) return { startTour: () => {}, stopTour: () => {}, isTourActive: false };
  return ctx;
}
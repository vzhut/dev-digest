"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingPreview } from "@devdigest/shared";
import { severityCounts } from "@/lib/severity";
import { FindingPreviewItem } from "./FindingPreviewItem";
import { CLOSE_DELAY_MS, POPOVER_GAP, POPOVER_WIDTH } from "./constants";
import { popoverPosition, type PopoverPosition } from "./helpers";
import { s } from "./styles";

/**
 * Severity icons (⊘2 ⚠1 💡1) that reveal a read-only "N findings in this run"
 * popover on hover or keyboard focus. Used by the PR list FINDINGS column and
 * the PR timeline run tiles. Spec: specs/findings-popover.md
 *
 * The popover is portalled to <body> so a parent's `overflow: hidden` (the PR
 * list table card) can't clip it. React still bubbles synthetic events through
 * the portal to this component's ancestors, so clicks are stopped here —
 * otherwise a click inside would trigger the PR row's navigation.
 */
export function FindingsPopover({ findings }: { findings: FindingPreview[] }) {
  const t = useTranslations("prReview");
  const popoverId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Open = we have the trigger's rect. The popover first renders hidden so its
  // real height can be measured, then gets a position where it fits entirely.
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  const [position, setPosition] = React.useState<PopoverPosition | null>(null);
  const open = anchor !== null;

  const counts = severityCounts(findings);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = React.useCallback(() => {
    cancelClose();
    setAnchor(null);
    setPosition(null);
  }, []);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  };
  const show = () => {
    cancelClose();
    if (open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  };

  React.useLayoutEffect(() => {
    if (!anchor || !popoverRef.current) return;
    setPosition(
      popoverPosition(anchor, { width: window.innerWidth, height: window.innerHeight }, {
        width: POPOVER_WIDTH,
        height: popoverRef.current.scrollHeight,
        gap: POPOVER_GAP,
      }),
    );
  }, [anchor]);

  // While open: Escape closes; scrolling the PAGE or resizing would detach the
  // fixed-position popover from its trigger, so close rather than chase it. The
  // capture-phase listener also sees scrolls inside the popover itself (only
  // possible when it is taller than the viewport) — those must not close it.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  React.useEffect(() => cancelClose, []);

  if (counts.length === 0) return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        aria-label={t("findingsPopover.title", { count: findings.length })}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        // Click only opens (touch has no hover) — toggling here would close the
        // popover the pointer just opened on its way in.
        onClick={(e) => {
          stop(e);
          show();
        }}
        style={s.trigger}
      >
        {counts.map(({ severity, count }) => {
          const meta = SEV[severity];
          const SevIcon = Icon[meta.icon];
          return (
            <span key={severity} style={s.triggerItem(meta.c)}>
              <SevIcon size={12.5} />
              <span className="tnum">{count}</span>
            </span>
          );
        })}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={stop}
            // preventDefault keeps focus on the trigger: otherwise pressing inside
            // blurs it and the blur-close fires while the pointer is still here.
            onMouseDown={(e) => {
              stop(e);
              e.preventDefault();
            }}
            style={s.popover(position)}
          >
            <div style={s.header}>
              <Icon.Info size={13} />
              {t("findingsPopover.title", { count: findings.length })}
            </div>
            <div style={s.list}>
              {findings.map((f) => (
                <FindingPreviewItem key={f.id} finding={f} />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

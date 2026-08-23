"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { StatusChip } from "@/components/ui";
import { TASK_STATUS_DEFS, taskStatusMeta, type TaskStatus } from "@/lib/store/types";

/*
 * The status chip, editable in place.
 *
 * The menu is portalled to <body> rather than positioned relative to the chip.
 * Every place this is used sits inside something that clips: the board column
 * scrolls horizontally, the table scrolls inside TableWrap, the drawer scrolls
 * vertically. An absolutely positioned menu is cropped by all three, and
 * `overflow: visible` on the ancestor is not available — the scrolling is the
 * point. Fixed coordinates from the trigger's own rect avoid the question.
 *
 * The cost of `position: fixed` is that it does not travel with a scroll, so
 * the menu closes on scroll and resize instead of drifting away from its chip.
 */

const MENU_WIDTH = 176;
const MENU_GAP = 6;
/** Roughly the menu's height, used only to decide whether to flip it upwards. */
const MENU_HEIGHT = TASK_STATUS_DEFS.length * 38 + 12;

export default function TaskStatusControl({
  status,
  onChange,
  disabled = false,
  size = "md",
  className = "",
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  // Portals need a document. This component renders inside client modules that
  // are still server-rendered for the first paint, so the menu is mounted only
  // once there is a browser to mount it into.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const meta = taskStatusMeta(status);

  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;

    const below = window.innerHeight - rect.bottom;
    const flip = below < MENU_HEIGHT && rect.top > below;

    setSpot({
      top: flip ? rect.top - MENU_HEIGHT - MENU_GAP : rect.bottom + MENU_GAP,
      // Clamped so a chip in the last column cannot push the menu off-screen.
      left: Math.min(Math.max(8, rect.left), window.innerWidth - MENU_WIDTH - 8),
    });
  }, []);

  // Measured before paint, so the menu never appears at 0,0 and jumps.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase, and propagation stopped: a Drawer above this listens for
      // Escape on document too, and without this the first Escape would close
      // the whole drawer rather than just the menu that is on top of it.
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };

    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    // `true` catches scrolling inside the board column and the table, not just
    // the window — which is exactly where these chips live.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const pick = (next: TaskStatus) => {
    setOpen(false);
    trigger.current?.focus();
    if (next !== status) onChange(next);
  };

  if (disabled) return <StatusChip label={meta.label} colour={meta.solid} size={size} className={className} />;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${meta.label}. Change it.`}
        onClick={(e) => {
          // The row underneath opens the drawer; the chip must not.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex max-w-full rounded-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
      >
        <StatusChip label={meta.label} colour={meta.solid} size={size} className="w-full" />
      </button>

      {ready &&
        open &&
        spot &&
        createPortal(
          <div
            ref={menu}
            role="listbox"
            aria-label="Task status"
            onClick={(e) => e.stopPropagation()}
            style={{ top: spot.top, left: spot.left, width: MENU_WIDTH }}
            className="animate-pop-in fixed z-[60] overflow-hidden rounded-card border border-line bg-card p-1.5 shadow-pop"
          >
            {TASK_STATUS_DEFS.map((def) => {
              const active = def.value === status;
              return (
                <button
                  key={def.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(def.value)}
                  className="flex w-full items-center gap-2 rounded-sm p-1 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <StatusChip label={def.label} colour={def.solid} size="sm" className="flex-1" />
                  {active && <Check size={14} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button, tone } from "@/components/ui";

/*
 * Modal used by every create/edit form and detail view.
 *
 * On phones it is a bottom sheet (thumb reach, full width); from `sm` up it is
 * a centred dialog. The body scrolls between a fixed header and footer so a
 * long form never pushes the actions off screen.
 */

const WIDTHS = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof WIDTHS;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and the page behind stops scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Move focus into the dialog so the keyboard lands somewhere sensible.
  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea, select, button",
    );
    first?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />

      <div
        ref={panel}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-card border border-line bg-card shadow-card sm:max-h-[88dvh] sm:rounded-card ${WIDTHS[size]}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="truncate text-[0.9375rem] font-bold uppercase text-heading">{title}</h2>
            {desc && <p className="mt-1 text-[0.75rem] leading-snug text-muted">{desc}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line p-4 sm:p-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Destructive confirmation. Deliberately names the record being removed. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-[0.8125rem] font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            style={{ background: "rgb(var(--danger-rgb))" }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-avatar"
          style={{ background: tone.red.soft, color: tone.red.text }}
        >
          <AlertTriangle size={19} />
        </span>
        <p className="pt-1.5 text-[0.8125rem] leading-relaxed text-text">{message}</p>
      </div>
    </Modal>
  );
}

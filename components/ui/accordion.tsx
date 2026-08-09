"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

/*
 * A collapsible section, styled as a Card so a stack of them reads as one
 * settings page rather than a list of unrelated panels.
 *
 * Native <button> + aria-expanded rather than <details>/<summary>: the header
 * carries a badge and a chevron that has to animate, and Safari's default
 * summary marker fights both.
 */

export function AccordionSection({
  title,
  desc,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  desc?: string;
  icon?: React.ElementType;
  /** Right-aligned in the header — a count, a status, anything short. */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="rounded-card border border-line bg-card text-text shadow-card">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:p-5"
        >
          {Icon && <Icon size={16} className="shrink-0 text-muted" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold uppercase text-heading">{title}</span>
            {desc && <span className="mt-1 block text-[13px] leading-snug text-muted">{desc}</span>}
          </span>
          {badge}
          <ChevronDown
            size={16}
            className="shrink-0 text-muted transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : undefined }}
          />
        </button>
      </h3>

      {/*
       * Unmounted when closed, not hidden. These sections hold live queries and
       * forms; keeping them mounted would fetch data for panels nobody opened,
       * which is the opposite of why the accordion was asked for.
       */}
      {open && (
        <div id={panelId} className="border-t border-line p-4 sm:p-5">
          {children}
        </div>
      )}
    </div>
  );
}

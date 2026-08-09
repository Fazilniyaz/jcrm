"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { dismissMutationError, useMutationError } from "@/lib/api/mutationErrors";

/*
 * The one place a refused write is visible.
 *
 * Every module's create/edit form closes optimistically — the store's mutators
 * return void, so there is nothing for a form to await and nothing for it to
 * show. This sits above them all and reports the API's own message when a write
 * comes back refused, so "nothing happened" is never the whole story a user
 * gets.
 *
 * Only the most recent failure is held. A burst of failures is one problem, and
 * stacking six copies of the same message helps nobody.
 */

const DISMISS_AFTER_MS = 8000;

export default function MutationErrorBanner() {
  const error = useMutationError();

  // Keyed on `id`, not on the object, so an identical message failing twice
  // restarts the timer rather than letting the first one dismiss the second.
  const id = error?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(dismissMutationError, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [id]);

  if (!error) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-3 bottom-3 z-100 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
    >
      <div className="flex items-start gap-3 rounded-sm border border-red-500/40 bg-card p-3 shadow-lg">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] font-semibold text-heading">
            Couldn&rsquo;t {error.what}
          </p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted">{error.message}</p>
        </div>
        <button
          type="button"
          onClick={dismissMutationError}
          aria-label="Dismiss"
          className="shrink-0 text-muted transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

"use client";

import { TrendingDown, TrendingUp, Loader2 } from "lucide-react";
import { Badge, SectionLabel } from "@/components/ui";
import { formatDate } from "@/lib/store/selectors";
import { useGetEmployeeQuery } from "@/lib/api/api";

/*
 * Why someone's KRA score is what it is.
 *
 * The API has recorded a KraEvent for every movement since QC review existed —
 * written in the SAME transaction as the score change, so the trail can never
 * disagree with the balance — but nothing rendered them, which left the number
 * on the roster unexplained and unarguable.
 *
 * `balanceAfter` is what the score became at that moment, so the history stays
 * true even if the score is edited later by another route. That is also why
 * this shows the recorded balance rather than recomputing it from the deltas.
 */

export default function KraHistory({ employeeId }: { employeeId: string }) {
  const { data, isLoading, isError } = useGetEmployeeQuery(employeeId);

  if (isLoading) {
    return (
      <div className="rounded-sm border border-line bg-card p-4">
        <SectionLabel>KRA history</SectionLabel>
        <p className="mt-2 flex items-center gap-2 text-[0.75rem] text-muted">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </p>
      </div>
    );
  }

  // A 403 here means the caller can't read this person's record. Saying so
  // would be noise in a panel they didn't ask for.
  if (isError || !data) return null;

  const events = data.kraEvents ?? [];

  return (
    <div className="rounded-sm border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>KRA history</SectionLabel>
        <span className="text-[0.75rem] font-semibold text-heading">
          {data.kra} / 100 now
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
          Nothing has moved this score yet. It changes when QC rejects a subtask
          on work they were assigned — each rejected subtask costs its own
          points.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {events.map((e) => {
            const down = e.delta < 0;
            return (
              <li key={e.id} className="flex items-start gap-2.5">
                {down ? (
                  <TrendingDown size={14} className="mt-0.5 shrink-0 text-danger" />
                ) : (
                  <TrendingUp size={14} className="mt-0.5 shrink-0 text-success" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.75rem] leading-relaxed text-text">
                    {e.reason}
                  </span>
                  <span className="block text-[0.6875rem] text-muted">
                    {formatDate(e.createdAt)} · balance {e.balanceAfter}
                  </span>
                </span>
                <Badge t={down ? "red" : "sky"}>
                  {down ? "" : "+"}
                  {e.delta}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ListTree, Search } from "lucide-react";
import {
  Card,
  Badge,
  Progress,
  TableWrap,
  Th,
  Td,
  Tr,
  Chip,
  SearchBox,
  EmptyState,
} from "@/components/ui";
import { useStore } from "@/lib/store/StoreProvider";
import {
  employeesByIds,
  itemPoints,
  projectsByIds,
  subtaskRows,
  type SubtaskRow,
} from "@/lib/store/selectors";
import { TASK_STATUS_TONE, type Task } from "@/lib/store/types";

/*
 * Every subtask in the workspace, flattened, with the task it belongs to.
 *
 * The Tasks view answers "what work is open"; this answers "what acceptance is
 * outstanding", which is a different question and used to require opening tasks
 * one at a time to see. A subtask carries its own acceptance score — the 0→1
 * claim that rolls up into its parent's completion — and its own points, which
 * is what it costs every assignee's KRA if QC rejects it.
 *
 * Read-only on purpose. A subtask's wording and points are edited on the task
 * form, and its score is set by QC in the review queue; offering a third place
 * to change them would mean three places to keep in agreement.
 */

type Filter = "all" | "open" | "partial" | "accepted";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Not started" },
  { key: "partial", label: "In progress" },
  { key: "accepted", label: "Accepted" },
];

function matchesFilter(row: SubtaskRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "accepted") return row.done;
  if (filter === "open") return row.accepted === 0;
  return row.accepted > 0 && !row.done;
}

/** Tone follows the acceptance score, not the parent task's column. */
function scoreTone(accepted: number) {
  if (accepted >= 100) return "sky" as const;
  if (accepted >= 50) return "blue" as const;
  if (accepted > 0) return "orange" as const;
  return "slate" as const;
}

export default function SubtaskList({ tasks }: { tasks: Task[] }) {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const all = useMemo(() => subtaskRows(tasks), [tasks]);

  const counts = useMemo(
    () => ({
      all: all.length,
      open: all.filter((r) => r.accepted === 0).length,
      partial: all.filter((r) => r.accepted > 0 && !r.done).length,
      accepted: all.filter((r) => r.done).length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((row) => matchesFilter(row, filter))
      .filter((row) => {
        if (!q) return true;
        const people = employeesByIds(state, row.task.assignedTo)
          .map((e) => e.name)
          .join(" ");
        return `${row.subtask.label} ${row.task.title} ${row.task.taskId} ${people}`
          .toLowerCase()
          .includes(q);
      })
      // Least accepted first: the outstanding work is the reason to open this.
      .sort(
        (a, b) =>
          a.accepted - b.accepted ||
          a.task.priority - b.task.priority ||
          a.task.taskId.localeCompare(b.task.taskId),
      );
  }, [all, filter, query, state]);

  if (all.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ListTree}
          title="No subtasks yet"
          desc="A subtask is one unit of acceptance under a task. Add them when creating or editing one."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          placeholder="Search subtasks, tasks or people…"
          value={query}
          onChange={setQuery}
          className="sm:w-64"
        />
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={filter === f.key}
            onClick={() => setFilter(f.key)}
            count={counts[f.key]}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="Nothing matches those filters" />
        </Card>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr className="border-b border-line">
                <Th>Subtask</Th>
                <Th>Task</Th>
                <Th>Project</Th>
                <Th>Assigned</Th>
                <Th className="w-44">Acceptance</Th>
                <Th>Points</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const people = employeesByIds(state, row.task.assignedTo);
                const projects = projectsByIds(state, row.task.projectIds);
                return (
                  <Tr key={`${row.task.id}:${row.subtask.id}`}>
                    <Td>
                      <span
                        className={`block font-medium ${
                          row.done ? "text-muted line-through" : "text-heading"
                        }`}
                      >
                        {row.subtask.label || "Untitled subtask"}
                      </span>
                    </Td>
                    <Td>
                      <span className="block whitespace-nowrap font-mono text-[0.6875rem] text-muted">
                        {row.task.taskId}
                      </span>
                      <span className="block max-w-[16rem] truncate text-[0.75rem] text-heading">
                        {row.task.title}
                      </span>
                    </Td>
                    <Td className="text-muted">
                      <span className="block max-w-[12rem] truncate text-[0.75rem]">
                        {projects.map((p) => p.name).join(", ") || "—"}
                      </span>
                    </Td>
                    <Td className="text-muted">
                      <span className="block max-w-[12rem] truncate text-[0.75rem]">
                        {people.map((p) => p.name).join(", ") || "Unassigned"}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={row.accepted} t={scoreTone(row.accepted)} />
                        <span className="w-9 shrink-0 text-right text-[0.75rem] font-semibold text-heading">
                          {row.accepted}%
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <Badge t={TASK_STATUS_TONE[row.task.status]}>
                        {itemPoints(row.subtask)}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

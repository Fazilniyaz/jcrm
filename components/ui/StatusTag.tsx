"use client";

/*
 * A person's status, drawn the one way the product draws it.
 *
 * There are TWO statuses in this system and they answer different questions:
 *
 *   workStatus  what the company knows — Idle, Work Assigned, Break, Leave.
 *               Derived from the roster and the task board.
 *   status      what the PERSON said — the Slack-style line they typed, with
 *               an emoji and an optional expiry.
 *
 * When someone has written their own, it wins: a person saying "heads-down on
 * the migration" is more useful than the system saying "Work Assigned", and
 * showing both side by side is how a row turns into a wall of pills. The work
 * status is then available on hover as the title, so nothing is lost.
 *
 * The colour carries meaning and is NOT the only carrier: every tag reads as
 * words too, which is what makes it survive a greyscale print and a screen
 * reader.
 */

import type { CSSProperties } from "react";
import { tone } from "@/components/ui";
import type { Presence } from "@/lib/api/types";
import type { Tone } from "@/lib/ui/tone";

export type StatusTagSize = "sm" | "md";

/**
 * The work status vocabulary, in both spellings it arrives in.
 *
 * The API sends the enum (`workAssigned`); the local store sends the label
 * ("Work Assigned"). Both land here rather than making every caller normalise,
 * because the two vocabularies meeting in one component is exactly the kind of
 * thing that gets normalised in four places and missed in a fifth.
 */
const WORK_STATUS: Record<string, { label: string; t: Tone }> = {
  idle: { label: "Idle", t: "slate" },
  "work assigned": { label: "Work Assigned", t: "blue" },
  workassigned: { label: "Work Assigned", t: "blue" },
  break: { label: "On Break", t: "orange" },
  leave: { label: "On Leave", t: "red" },
};

function workStatusOf(raw?: string | null): { label: string; t: Tone } | null {
  if (!raw) return null;
  return WORK_STATUS[raw.trim().toLowerCase()] ?? { label: raw, t: "slate" };
}

/**
 * The tone a free-written status gets.
 *
 * Keyed off the words people actually use, so "on a call" is not the same
 * colour as "out sick". Anything unrecognised comes back violet — a deliberate
 * choice rather than grey, because a status someone bothered to type should
 * look like something rather than like a disabled control.
 */
function customStatusTone(text: string): Tone {
  const s = text.toLowerCase();
  if (/(sick|out|off|away|holiday|vacation|leave|afk)/.test(s)) return "red";
  if (/(lunch|break|coffee|brb|back in|stepping)/.test(s)) return "orange";
  if (/(call|meeting|interview|standup|sync|presenting)/.test(s)) return "pink";
  if (/(focus|heads.?down|deep work|do not disturb|dnd|working|building|coding)/.test(s))
    return "purple";
  if (/(remote|wfh|home|travel|commut)/.test(s)) return "teal";
  if (/(available|free|open|here)/.test(s)) return "green";
  return "purple";
}

const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  away: "Away",
  offline: "Offline",
};

const SIZES: Record<StatusTagSize, { pad: string; text: string; dot: number; gap: string }> = {
  sm: { pad: "px-2 py-[0.1875rem]", text: "text-[0.6875rem]", dot: 6, gap: "gap-1.5" },
  md: { pad: "px-2.5 py-1", text: "text-[0.75rem]", dot: 7, gap: "gap-2" },
};

export function StatusTag({
  status,
  workStatus,
  presence,
  size = "sm",
  className = "",
  title,
}: {
  /** What the person wrote about themselves. Wins when present. */
  status?: { text: string | null; emoji: string | null; until?: string | null } | null;
  /** What the system knows. The fallback, and the hover text otherwise. */
  workStatus?: string | null;
  /** Only used when there is nothing else at all to say. */
  presence?: Presence;
  size?: StatusTagSize;
  className?: string;
  title?: string;
}) {
  const s = SIZES[size];
  const work = workStatusOf(workStatus);
  const custom = status?.text?.trim() || null;
  const emoji = status?.emoji?.trim() || null;

  // Nothing written, nothing known: fall back to presence rather than drawing
  // an empty pill, which reads as a loading state.
  let label: string;
  let t: Tone;
  if (custom || emoji) {
    label = custom ?? "";
    t = custom ? customStatusTone(custom) : "purple";
  } else if (work) {
    label = work.label;
    t = work.t;
  } else if (presence) {
    label = PRESENCE_LABEL[presence];
    t = presence === "online" ? "green" : presence === "away" ? "orange" : "slate";
  } else {
    return null;
  }

  const c = tone[t];
  const expires = status?.until ? new Date(status.until) : null;
  const hover =
    title ??
    [
      custom ? `Status: ${emoji ? `${emoji} ` : ""}${custom}` : null,
      work ? work.label : null,
      expires && !Number.isNaN(expires.getTime()) ? `Until ${expires.toLocaleString()}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  /*
   * A soft fill with a same-hue hairline, not a flat block.
   *
   * The border is what keeps the pill visible against the card in dark mode,
   * where a 12%-alpha wash and the card surface are within a point of each
   * other. `color-mix` rather than a second token: the hairline is always the
   * same hue as the fill, so deriving it means a new palette entry needs no
   * second definition.
   */
  const style: CSSProperties = {
    background: c.soft,
    color: c.text,
    borderColor: `color-mix(in srgb, ${c.solid} 35%, transparent)`,
  };

  return (
    <span
      title={hover || undefined}
      className={`inline-flex max-w-full items-center ${s.gap} ${s.pad} rounded-full border font-semibold leading-none ${s.text} ${className}`}
      style={style}
    >
      {emoji ? (
        <span aria-hidden className="shrink-0 leading-none">
          {emoji}
        </span>
      ) : (
        <span
          aria-hidden
          className="shrink-0 rounded-full"
          style={{ width: s.dot, height: s.dot, background: c.solid }}
        />
      )}
      {label && <span className="truncate">{label}</span>}
    </span>
  );
}

export default StatusTag;

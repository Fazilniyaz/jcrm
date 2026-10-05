"use client";

/*
 * A person, drawn the one way the whole product draws them.
 *
 * Three things it settles so no screen has to decide again:
 *   - a photo when they have one, their initials when they do not;
 *   - the presence dot, with the SAME meaning everywhere;
 *   - that the dot is announced, not just coloured, so "is Priya around?" is
 *     answerable without seeing the green.
 */

import { Avatar, tone } from "@/components/ui";
import type { Presence } from "@/lib/api/types";
import type { Tone } from "@/lib/ui/tone";

/** Green when connected, amber when they've marked themselves away, hollow when gone. */
const DOT: Record<Presence, { colour: string; label: string }> = {
  online: { colour: "rgb(var(--success-vivid-rgb))", label: "Online" },
  away: { colour: "rgb(var(--warning-vivid-rgb))", label: "Away" },
  offline: { colour: "transparent", label: "Offline" },
};

export function PersonAvatar({
  name,
  initials,
  avatar,
  t = "blue",
  size = 36,
  presence,
  ring = "var(--custom-white)",
}: {
  name?: string;
  initials: string;
  avatar?: string | null;
  t?: Tone;
  size?: number;
  /** Omit to draw no dot at all — not every surface is about availability. */
  presence?: Presence;
  /** The colour behind the dot, so it reads as cut out of the surface. */
  ring?: string;
}) {
  const dot = presence ? DOT[presence] : null;
  const dotSize = Math.max(8, Math.round(size * 0.28));

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      title={name ? (dot ? `${name} — ${dot.label}` : name) : undefined}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL has
        // nothing for the image optimiser to fetch or cache.
        <img
          src={avatar}
          alt={name ? `${name}'s profile picture` : ""}
          width={size}
          height={size}
          className="rounded-avatar object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <Avatar initials={initials} t={t} size={size} />
      )}

      {dot && (
        <>
          <span
            aria-hidden
            className="absolute -bottom-px -end-px rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              background: dot.colour,
              boxShadow: `0 0 0 2px ${ring}`,
              // Offline is a hollow ring, not a grey disc: an empty circle reads
              // as "not here" where a filled one reads as another status.
              border: dot.colour === "transparent" ? `2px solid ${tone.slate.solid}` : undefined,
            }}
          />
          <span className="sr-only">{dot.label}</span>
        </>
      )}
    </span>
  );
}

export default PersonAvatar;

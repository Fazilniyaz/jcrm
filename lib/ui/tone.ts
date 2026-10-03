/**
 * The product's colour vocabulary.
 *
 * Resolved to real colours by `tone` in components/ui/index.tsx so they follow
 * the light/dark theme and the active palette. Every badge, avatar, progress
 * bar, nav tile and stat tile takes one of these rather than a hex value.
 *
 * The five original keys (blue, sky, orange, red, slate) are kept so no
 * existing caller moves; the rest of the palette is additive — the nav rail and
 * top bar use them so a colour comes to mean a place.
 */
export type Tone =
  | "blue"
  | "sky"
  | "orange"
  | "red"
  | "slate"
  | "primary"
  | "green"
  | "amber"
  | "info"
  | "purple"
  | "pink"
  | "teal";

import type { ComponentType, CSSProperties } from "react";

/**
 * An icon component — in practice always a lucide glyph.
 *
 * Deliberately NOT `React.ElementType`. That type is the union of every valid
 * JSX tag, so checking props against it means intersecting the props of every
 * intrinsic element. With @react-three/fiber installed that union gains ~200
 * three.js elements (it augments `JSX.IntrinsicElements` globally and
 * unconditionally), the intersection collapses to `never`, and every
 * `<Icon size={16} />` in the app fails to typecheck.
 *
 * Naming the three props an icon actually takes is both the fix and the more
 * honest type: nothing here was ever meant to accept a `<div>`.
 */
export type IconType = ComponentType<{
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
  /** Icons are coloured inline often enough that leaving this out just pushes
   *  callers back to `React.ElementType` and the `never` problem above. */
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}>;

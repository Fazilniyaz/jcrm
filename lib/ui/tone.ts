/**
 * The product's colour vocabulary.
 *
 * Five names, resolved to real colours by `tone` in components/ui/index.tsx so
 * they follow the light/dark theme. Every badge, avatar, progress bar and stat
 * tile takes one of these rather than a hex value.
 *
 * It lived in lib/data/mock.ts until that file was deleted with the rest of the
 * demo data. Nothing about it was ever demo — it is a closed vocabulary the
 * whole UI is typed against.
 */
export type Tone = "blue" | "sky" | "orange" | "red" | "slate";

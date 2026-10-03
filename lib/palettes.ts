// The colour themes ("palettes") — data only, no React, so the server-rendered
// app/layout.tsx can import it too: its pre-paint script restores a stored
// palette only if the id is in PALETTE_IDS, and a stale one falls back to
// "classic". Switching lives in lib/theme.ts; the CSS is app/theme-palettes.css.

export type PaletteId =
  | "classic"
  | "royalGold"
  | "obsidian"
  | "porcelain"
  | "azure"
  | "sapphire"
  | "emerald"
  | "violet"
  | "wine";

export type PalettePreview = {
  ground: string;
  primary: string;
  data: [string, string];
};

export type Palette = {
  id: PaletteId;
  name: string;
  /** What the Settings swatch draws for each mode: ground, primary, two data hues. */
  preview: { light: PalettePreview; dark: PalettePreview };
};

/*
 * In picker order. "classic" is the default and has no CSS of its own — it IS
 * the existing tokens. Mirrors app/theme-palettes.css: a new palette needs its
 * CSS blocks there and an entry here.
 */
export const PALETTES: readonly Palette[] = [
  {
    id: "classic",
    name: "Classic",
    preview: {
      light: { ground: "#F8F9FA", primary: "#C35523", data: ["#1B84FF", "#AB47BC"] },
      dark: { ground: "#121417", primary: "#F26522", data: ["#1B84FF", "#B863C6"] },
    },
  },
  {
    id: "royalGold",
    name: "Royal Gold",
    preview: {
      light: { ground: "#FBF8F1", primary: "#8A5A12", data: ["#A56E17", "#2F698F"] },
      dark: { ground: "#08080A", primary: "#E5B15B", data: ["#E5B15B", "#81B2D2"] },
    },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    preview: {
      light: { ground: "#F5F6F7", primary: "#2F698F", data: ["#2F698F", "#1F2937"] },
      dark: { ground: "#0B0C0E", primary: "#81B2D2", data: ["#81B2D2", "#E4E7EB"] },
    },
  },
  {
    id: "porcelain",
    name: "Porcelain",
    preview: {
      light: { ground: "#FAFAF9", primary: "#3D3A36", data: ["#8A847D", "#2F698F"] },
      dark: { ground: "#1C1C1E", primary: "#D9D5CF", data: ["#D9D5CF", "#81B2D2"] },
    },
  },
  {
    id: "azure",
    name: "Azure",
    preview: {
      light: { ground: "#FAFAFA", primary: "#1D6FB8", data: ["#1D6FB8", "#6E5A3C"] },
      dark: { ground: "#0A0A0A", primary: "#81B2D2", data: ["#81B2D2", "#E6D3B3"] },
    },
  },
  {
    id: "sapphire",
    name: "Sapphire",
    preview: {
      light: { ground: "#FAFAFA", primary: "#2563EB", data: ["#2563EB", "#0B6B6F"] },
      dark: { ground: "#0A0A0A", primary: "#7CA0FF", data: ["#7CA0FF", "#5FC9C0"] },
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    preview: {
      light: { ground: "#FAFAFA", primary: "#1B7A51", data: ["#1F8A5B", "#1E4F7A"] },
      dark: { ground: "#0A0A0A", primary: "#7CBD89", data: ["#7CBD89", "#A9C8F0"] },
    },
  },
  {
    id: "violet",
    name: "Amethyst",
    preview: {
      light: { ground: "#FAFAFA", primary: "#6242D6", data: ["#6D4AE0", "#0B6B6F"] },
      dark: { ground: "#0A0A0A", primary: "#A78BFA", data: ["#A78BFA", "#5FC9C0"] },
    },
  },
  {
    id: "wine",
    name: "Garnet",
    preview: {
      light: { ground: "#FAFAFA", primary: "#9B2242", data: ["#A8123E", "#2F698F"] },
      dark: { ground: "#0A0A0A", primary: "#E0637F", data: ["#E0637F", "#81B2D2"] },
    },
  },
];

export const PALETTE_IDS: readonly PaletteId[] = PALETTES.map((p) => p.id);

export function isPaletteId(value: string): value is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(value);
}

"use client";

// Theme switching, shared by every toggle in the app.
//
// Two independent axes, both attributes on <html>:
//   data-theme-mode = "light" | "dark"   — stored as "jadvix.theme"
//   data-theme      = palette id          — stored as "jadvix.theme-palette"
// Both are restored before first paint by the inline script in app/layout.tsx;
// the palettes themselves are app/theme-palettes.css and lib/palettes.ts.
//
// Flipping either attribute swaps the token palette at once. On its own that
// lands as a hard cut; the brief `theme-transition` class added here is what
// globals.css hangs a short colour cross-fade on. It is pulled off a fraction
// after the fade ends, so no ordinary hover or focus change is dragged through
// it. `prefers-reduced-motion` is honoured twice: the class is not added, and
// globals.css also neutralises the transition if it somehow is.

import { useEffect, useState } from "react";
import { isPaletteId, type PaletteId } from "./palettes";

const CLEAR_AFTER_MS = 260; // a hair past the 0.2s CSS transition

export const THEME_KEY = "jadvix.theme";
export const PALETTE_KEY = "jadvix.theme-palette";

let clearTimer: number | undefined;

function crossFade(root: HTMLElement) {
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reducedMotion) {
    root.classList.add("theme-transition");
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => root.classList.remove("theme-transition"), CLEAR_AFTER_MS);
  }
}

export function applyThemeMode(mode: "light" | "dark") {
  const next = mode === "light" ? "light" : "dark";
  const root = document.documentElement;
  crossFade(root);
  root.setAttribute("data-theme-mode", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // A locked-down profile still gets the switch, just not the memory of it.
  }
}

export function applyThemePalette(id: string) {
  const next: PaletteId = isPaletteId(id) ? id : "classic";
  const root = document.documentElement;
  crossFade(root);
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem(PALETTE_KEY, next);
  } catch {
    // As above: the switch still applies for this page.
  }
}

/*
 * The live value of an attribute on <html>, for controls that show the current
 * theme. Seeded from the DOM after mount (the server cannot know it, so reading
 * it during render would be a hydration mismatch) and kept in sync with a
 * MutationObserver, so two controls for the same setting never disagree.
 */
export function useHtmlAttribute(name: string, fallback: string): string {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setValue(root.getAttribute(name) ?? fallback);
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: [name] });
    return () => observer.disconnect();
  }, [name, fallback]);
  return value;
}

/** The current light/dark mode, live. Falls back to light, the default. */
export function useThemeMode(): "light" | "dark" {
  return useHtmlAttribute("data-theme-mode", "light") === "dark" ? "dark" : "light";
}

/** The current palette id, live. Falls back to "classic". */
export function useThemePalette(): string {
  return useHtmlAttribute("data-theme", "classic");
}

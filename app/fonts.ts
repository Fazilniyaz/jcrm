import localFont from "next/font/local";

/*
 * Self-hosted, not next/font/google.
 *
 * next/font/google downloads every family at build time. On a slow or filtered
 * connection that fetch times out and the whole site silently renders in the
 * fallback — the build still succeeds, so the only sign is a wall of
 * AbortErrors. The woff2 files live in /fonts and are read off disk, so the
 * build has no network dependency at all: reproducible offline, and faster.
 *
 * These are the exact faces the Ropix portal skin is matched to:
 *
 *   Roboto      — the UI face. Wider and rounder than a geometric grotesque,
 *                 so dense rows of small text stay open at 14px. Carried on
 *                 --font-portal-sans, which portal-skin.css points every
 *                 --font-sans / --font-heading at.
 *   Geist Mono  — every figure, id and date. Its digits share one width, which
 *                 is what lets a column of amounts line up. --font-portal-mono.
 *
 * `-var` is a VARIABLE font (one file spanning a weight range), so it gets a
 * single entry with a range, never one per weight — listing it per weight
 * makes the browser synthesise faux-bold rather than use the real cut.
 */

export const portalSans = localFont({
  src: [{ path: "../fonts/Roboto-var.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-portal-sans",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const portalMono = localFont({
  src: [
    { path: "../fonts/GeistMono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeistMono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-portal-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/** Added to <html> so the skin's font variables resolve everywhere. */
export const portalFontClass = `${portalSans.variable} ${portalMono.variable}`;

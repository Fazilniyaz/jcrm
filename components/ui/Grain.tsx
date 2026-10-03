"use client";
// A fixed noise overlay.
//
// Flat vector surfaces read as sterile. A trace of grain gives the background
// something for the eye to land on without adding a single visible element.
// Three properties make it safe rather than decorative clutter:
//
//   pointer-events-none   it can never intercept a click
//   fixed + inset-0       it does not scroll, so it reads as the surface the
//                         page sits on rather than a texture glued to content
//   very low opacity      visible as depth, never as a pattern
//
// The noise is an inline SVG turbulence filter as a data URI: no network
// request, no image asset, a few hundred bytes, and it tiles perfectly.
const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">
       <filter id="n">
         <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
         <feColorMatrix type="saturate" values="0"/>
       </filter>
       <rect width="140" height="140" filter="url(#n)" opacity="0.5"/>
     </svg>`,
  );

export default function Grain() {
  // One opacity, not a per-theme pair. `mix-blend-overlay` already adapts: it
  // lightens against dark surfaces and darkens against light ones on its own.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-overlay"
      style={{ backgroundImage: `url("${NOISE}")`, backgroundSize: "140px 140px" }}
    />
  );
}

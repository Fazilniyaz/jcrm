"use client";

//
// Settings → Appearance: light/dark, and the colour theme.
//
// Both controls read their state from the attributes on <html> (through
// useThemeMode / useThemePalette), not from React state, so they always show
// what is on screen — including a change made from the header toggle while this
// card is open. Writing goes through the same two functions the rest of the app
// uses, which persist in localStorage and are restored before first paint.
//
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { PALETTES } from "@/lib/palettes";
import { applyThemeMode, applyThemePalette, useThemeMode, useThemePalette } from "@/lib/theme";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-card border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
        active
          ? "border-transparent bg-primary text-on-primary"
          : "border-line text-muted hover:border-transparent hover:bg-hover hover:text-heading"
      }`}
    >
      {children}
    </button>
  );
}

export default function AppearanceCard() {
  const mode = useThemeMode();
  const palette = useThemePalette();

  return (
    <Card>
      <CardHeader
        title="Appearance"
        desc="Light or dark, and a colour theme. Saved in this browser."
        action={
          <div role="group" aria-label="Mode" className="flex gap-1.5">
            <Chip active={mode === "light"} onClick={() => applyThemeMode("light")}>
              Light
            </Chip>
            <Chip active={mode === "dark"} onClick={() => applyThemeMode("dark")}>
              Dark
            </Chip>
          </div>
        }
      />
      <CardBody>
        <div
          role="radiogroup"
          aria-label="Colour theme"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9"
        >
          {PALETTES.map((p) => {
            const active = palette === p.id;
            const v = p.preview[mode];
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => applyThemePalette(p.id)}
                className={`rounded-card border bg-card p-2 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active ? "border-primary" : "border-line"
                }`}
              >
                {/* The theme in miniature, in the current mode: its ground, a
                    primary bar, and its two data hues. */}
                <span
                  aria-hidden="true"
                  className="block rounded-sm border border-line p-2"
                  style={{ background: v.ground }}
                >
                  <span className="block h-2 w-3/5 rounded-full" style={{ background: v.primary }} />
                  <span className="mt-2 flex gap-1.5">
                    {v.data.map((c, i) => (
                      <span
                        key={i}
                        className="block h-2.5 w-2.5 rounded-full"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-[0.8125rem] font-medium text-heading">
                    {p.name}
                  </span>
                  {active && <Badge t="sky">On</Badge>}
                </span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

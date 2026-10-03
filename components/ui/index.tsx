/*
 * Shared primitives. Every module composes these so the whole product reads as
 * one system — same card chrome, same badge shape, same table rhythm.
 * All colour comes from the Jadvix tokens in globals.css.
 */
import Link from "next/link";
import type { Tone } from "@/lib/ui/tone";
import { Sparkline } from "@/components/charts/Charts";
import type { IconType } from "@/lib/ui/icon";

/*
 * The tone system. Every tint resolves through a CSS variable, so all of it
 * follows the light/dark theme AND the chosen palette without a conditional in
 * a component.
 *
 * Four parts, and mixing them up is the one way to break contrast:
 *
 *   soft     the pale wash. A badge or icon-tile GROUND. Pair with `text`.
 *   text     the hue at >= 4.5:1 on the card. Labels, links, small type, icons
 *            on a soft wash.
 *   solid    the saturated hue. A LARGE fill — avatar, progress bar, chart
 *            series — where the 3:1 graphic threshold applies.
 *   onSolid  the label colour that sits ON `solid`. Not always white: the vivid
 *            green, amber and cyan are too light, so those carry ink instead.
 */
const t = (
  name: string,
  onSolid = "var(--on-vivid)",
): { soft: string; solid: string; text: string; onSolid: string } => ({
  soft: `var(--${name}-soft)`,
  solid: `rgb(var(--${name}-vivid-rgb))`,
  text: `rgb(var(--${name}-rgb))`,
  onSolid,
});

export const tone: Record<Tone, { soft: string; solid: string; text: string; onSolid: string }> = {
  /* the five original keys */
  blue: t("info"),
  sky: t("success", "var(--on-vivid-success)"),
  orange: t("warning", "var(--on-vivid-warning)"),
  red: t("danger"),
  slate: t("secondary"),

  /* the rest of the palette */
  primary: t("primary"),
  green: t("success", "var(--on-vivid-success)"),
  amber: t("warning", "var(--on-vivid-warning)"),
  info: t("info"),
  purple: t("purple"),
  pink: t("pink"),
  teal: t("teal", "var(--on-vivid-teal)"),
};

/** Maps a free-text status onto a brand tone. Red stays reserved for genuinely
 *  bad states so it keeps its meaning. */
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (/(overdue|rejected|delayed|critical|incident|hold|failed|open)/.test(s)) return "red";
  if (/(pending|at risk|awaiting|processing|degraded|major|notice|in review|triaged)/.test(s))
    return "orange";
  if (/(paid|approved|delivered|resolved|closed|operational|complete|won|done)/.test(s))
    return "sky";
  return "blue";
}

/* ------------------------------------------------------------------ card -- */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Flat: a plain white block on an off-white ground — no border, no shadow.
  // The separation comes from the page being off-white against the card's
  // white; at this density, adding a border and shadow to every card turns the
  // screen busy. (Matches the Ropix reference surface.)
  return <div className={`rounded-card bg-card text-text ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    // 16px semibold sentence case and a hairline, per the reference. Caps at
    // this density turn every card into a shout and cost the headings their
    // hierarchy.
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold text-heading">{title}</h3>
        {desc && <p className="mt-1 text-[13px] leading-snug text-muted">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------- page head -- */

export function PageHead({
  title,
  blurb,
  actions,
}: {
  title: string;
  blurb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.125rem] font-semibold text-heading">{title}</h1>
        {blurb && <p className="mt-0.5 text-[13px] text-muted">{blurb}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- badge -- */

export function Badge({ children, t }: { children: React.ReactNode; t: Tone }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-sm px-[0.45em] pb-[0.25em] pt-[0.39em] text-[75%] font-medium leading-none"
      style={{ background: tone[t].soft, color: tone[t].text }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge t={statusTone(status)}>{status}</Badge>;
}

/**
 * The bright, solid status pill.
 *
 * Deliberately not a `Badge`: a Badge is a 12% wash of the hue with coloured
 * text, which is right for a fact you read in passing (a priority, a role) but
 * too quiet for the thing the whole board is organised by. This is the full
 * hue with white on top, so a column reads as one colour from across the room.
 *
 * `colour` is the definition's `solid`, passed in rather than looked up, so the
 * component stays a dumb primitive and the status vocabulary lives in one file.
 */
export function StatusChip({
  label,
  colour,
  size = "md",
  className = "",
}: {
  label: string;
  colour: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center truncate rounded-sm font-semibold leading-none text-white ${
        size === "sm" ? "px-2 py-1 text-[0.6875rem]" : "px-2.5 py-1.5 text-[0.75rem]"
      } ${className}`}
      style={{ background: colour }}
    >
      {label}
    </span>
  );
}

/**
 * A named owner, bright enough to scan a column of them.
 *
 * Replaces the initials-only AvatarStack wherever ONE person is the answer to
 * "whose is this". The stack is still right for overflow — it says "and three
 * others" in the space of a word — so both exist and neither is a fallback for
 * the other.
 */
export function OwnerChip({
  initials,
  name,
  t = "blue",
  size = "md",
}: {
  initials: string;
  name: string;
  t?: Tone;
  size?: "sm" | "md";
}) {
  const avatar = size === "sm" ? 18 : 22;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-avatar ps-1 ${
        size === "sm" ? "py-0.5 pe-2 text-[0.6875rem]" : "py-1 pe-2.5 text-[0.75rem]"
      }`}
      style={{ background: tone[t].soft }}
    >
      <Avatar initials={initials} t={t} size={avatar} />
      <span className="min-w-0 truncate font-semibold" style={{ color: tone[t].text }}>
        {name}
      </span>
    </span>
  );
}

/** "Unassigned", in the same footprint as an OwnerChip so rows stay aligned. */
export function UnassignedChip({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center rounded-avatar border border-dashed border-line text-muted ${
        size === "sm" ? "px-2 py-1 text-[0.6875rem]" : "px-2.5 py-1.5 text-[0.75rem]"
      }`}
    >
      Unassigned
    </span>
  );
}

/* -------------------------------------------------------------- avatar -- */

export function Avatar({
  initials,
  t = "blue",
  size = 42,
}: {
  initials: string;
  t?: Tone;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-avatar font-medium"
      style={{
        background: tone[t].solid,
        // Not text-white: three of the solid fills (green, amber, cyan) are too
        // light to carry white. Each tone names its own correct label colour.
        color: tone[t].onSolid,
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.31)),
      }}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ items }: { items: string[] }) {
  return (
    <span className="flex -space-x-2">
      {items.map((i, idx) => (
        <span
          key={i + idx}
          className="inline-flex h-7 w-7 items-center justify-center rounded-avatar text-[10px] font-medium ring-2 ring-[var(--custom-white)]"
          style={{
            background: tone[(["blue", "orange", "sky", "slate"] as Tone[])[idx % 4]].solid,
            color: tone[(["blue", "orange", "sky", "slate"] as Tone[])[idx % 4]].onSolid,
          }}
        >
          {i}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------ progress -- */

export function Progress({ value, t = "blue" }: { value: number; t?: Tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-light">
      <div
        className="h-full rounded transition-[width] duration-500"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: tone[t].solid }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- stat tile -- */

export function StatTile({
  label,
  value,
  hint,
  t = "blue",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  t?: Tone;
  icon?: IconType;
}) {
  const c = tone[t];
  return (
    // The tile carries its hue three ways: a rule down the leading edge, a
    // solid disc under the glyph, and a soft bloom in the far corner. Together
    // they give a flat card depth without a shadow.
    <Card className="pk-lift relative overflow-hidden p-4">
      <span
        aria-hidden
        className="absolute inset-y-0 start-0 w-[3px]"
        style={{ background: c.solid }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -end-6 -top-10 h-28 w-28 rounded-full opacity-60 blur-2xl"
        style={{ background: c.soft }}
      />
      <div className="relative flex items-center gap-3.5">
        {Icon && (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{
              background: c.solid,
              color: c.onSolid,
              boxShadow: `0 8px 18px -8px ${c.solid}`,
            }}
          >
            <Icon size={20} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
            {label}
          </p>
          <p className="mt-1 text-[1.625rem] font-bold leading-none text-heading">{value}</p>
          {hint && <p className="mt-1.5 text-[0.75rem] text-muted">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- hero band -- */

/**
 * The gradient banner at the top of a module.
 *
 * One per screen at most: it is the loudest thing the design system owns, and
 * a second one on the same page turns both into wallpaper. Colour comes from
 * `.pk-hero` (the measured orange→magenta pair) so it follows the palette.
 */
export function HeroBand({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pk-hero pk-sheen relative overflow-hidden rounded-card px-6 py-6 sm:px-7">
      {/* Two faint discs, so the band is not a flat sheet of colour. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -end-10 -top-16 h-56 w-56 rounded-full"
        style={{ background: "rgba(255,255,255,0.10)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-24 end-24 h-48 w-48 rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.08em]"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {eyebrow}
            </span>
          )}
          <h2 className="mt-3 text-[1.375rem] font-bold leading-tight">{title}</h2>
          {desc && <p className="mt-1.5 max-w-xl text-[0.875rem] opacity-90">{desc}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

/** The button that sits on a HeroBand — inverted, so it reads as the one action. */
export function HeroAction({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-card px-4 py-2.5 text-[0.8125rem] font-semibold transition-transform hover:-translate-y-px"
      style={{ background: "var(--on-hero)", color: "var(--hero-from)" }}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------- trend card -- */

/**
 * A figure with its recent shape beside it.
 *
 * The sparkline is deliberately unlabelled — it is there to say "rising",
 * "flat" or "falling" at a glance, and anyone who needs the actual series
 * opens the module the tile links to.
 */
export function TrendCard({
  label,
  value,
  delta,
  data,
  t = "blue",
  id,
}: {
  label: string;
  value: string;
  /** e.g. "+12%" / "-100%". Rendered next to "vs last month". */
  delta?: string;
  data: readonly number[];
  t?: Tone;
  id: string;
}) {
  const c = tone[t];
  const down = Boolean(delta && delta.trim().startsWith("-"));
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-heading">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.solid }} />
            {label}
          </p>
          <p className="mt-2 text-[1.375rem] font-bold leading-none text-heading">{value}</p>
          {delta && (
            <p className="mt-2 text-[0.75rem]">
              <span
                className="font-semibold"
                style={{ color: down ? "rgb(var(--danger-rgb))" : "rgb(var(--success-rgb))" }}
              >
                {delta}
              </span>
              <span className="text-muted"> vs last month</span>
            </p>
          )}
        </div>
        <div className="w-28 shrink-0 sm:w-36">
          <Sparkline data={data} color={c.solid} id={id} height={48} />
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- table -- */

/** Horizontal scroll is kept on the wrapper so narrow screens never push the
 *  page itself sideways. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-muted sm:px-5 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 align-middle sm:px-5 ${className}`}>
      {children}
    </td>
  );
}

export function Tr({
  children,
  onClick,
  expanded,
  className = "",
}: {
  children: React.ReactNode;
  /** Makes the whole row a disclosure control. */
  onClick?: () => void;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      // A row can't be a <button>, so carry the semantics on the row itself and
      // let the caller put a real focusable control in the first cell.
      aria-expanded={onClick ? Boolean(expanded) : undefined}
      className={`border-b border-line transition-colors last:border-0 hover:bg-hover ${
        onClick ? "cursor-pointer" : ""
      } ${expanded ? "bg-hover" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

/** The panel a disclosure row opens into. Spans the full table width. */
export function ExpandRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td colSpan={colSpan} className="bg-subtle/60 px-4 py-4 sm:px-5">
        {children}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------- toolbar -- */

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  onClick,
  type = "button",
  disabled = false,
  className = "",
  title,
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  icon?: IconType;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-[0.8125rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-primary text-on-primary transition-[filter] hover:brightness-110",
    ghost: "border border-line bg-card text-text hover:border-primary hover:text-primary",
    danger: "border border-line bg-card hover:border-danger",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles} ${className}`}
      style={variant === "danger" ? { color: "rgb(var(--danger-rgb))" } : undefined}
    >
      {Icon && <Icon size={15} className="shrink-0" />}
      {children}
    </button>
  );
}

/** Square icon-only control — row actions, close buttons, steppers. */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  tone: t,
  size = 32,
  type = "button",
  disabled = false,
  spinning = false,
}: {
  icon: IconType;
  label: string;
  onClick?: () => void;
  tone?: Tone;
  size?: number;
  type?: "button" | "submit";
  /** Refuses the press and dims. Set while the action it fires is in flight. */
  disabled?: boolean;
  /** Spins the glyph. Pass a loader icon with it; on its own it just rotates. */
  spinning?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={spinning || undefined}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded-sm border border-line text-muted transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-muted"
      style={{
        width: size,
        height: size,
        ...(t ? { background: tone[t].soft, color: tone[t].text, borderColor: "transparent" } : {}),
      }}
    >
      <Icon size={Math.round(size * 0.47)} className={spinning ? "animate-spin" : undefined} />
    </button>
  );
}

/** Uncontrolled unless `onChange` is passed, so the decorative uses still work. */
export function SearchBox({
  placeholder = "Search…",
  value,
  onChange,
  className = "sm:w-56",
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      aria-label={placeholder}
      className={`h-9 w-full rounded-sm border border-input-border bg-form-bg px-3 text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary ${className}`}
    />
  );
}

/** Becomes a real filter control when `onClick` is given; otherwise a label. */
export function Chip({
  children,
  active = false,
  onClick,
  count,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  const cls = `rounded-sm px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors ${
    active ? "bg-primary text-white" : "border border-line bg-card text-muted"
  }`;
  const body = (
    <>
      {children}
      {count !== undefined && (
        <span className={`ms-1.5 ${active ? "text-white/75" : "text-muted"}`}>{count}</span>
      )}
    </>
  );
  if (!onClick) return <span className={`cursor-default ${cls}`}>{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${cls} cursor-pointer hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        active ? "hover:text-white" : ""
      }`}
    >
      {body}
    </button>
  );
}

/* ----------------------------------------------------------- empty note -- */

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-sm bg-subtle px-3 py-2 text-[0.75rem] text-muted">{children}</p>
  );
}

/* -------------------------------------------------------------- layout -- */

export function Grid({
  cols = 4,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const map = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  } as const;
  return <div className={`grid gap-4 ${map[cols]}`}>{children}</div>;
}

/* ------------------------------------------------------------ detail bits -- */

/** Small uppercase heading inside an expanded row or a detail panel. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

/** A labelled fact. `block` stacks it; otherwise label and value sit inline. */
export function Fact({
  label,
  children,
  block = false,
}: {
  label: string;
  children: React.ReactNode;
  block?: boolean;
}) {
  if (block) {
    return (
      <div>
        <SectionLabel>{label}</SectionLabel>
        <div className="text-[0.8125rem] leading-relaxed text-text">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[0.75rem] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[0.8125rem] font-medium text-heading">
        {children}
      </dd>
    </div>
  );
}

/** Rounded pill naming a person, used wherever a list of people is rendered. */
export function PersonChip({
  initials,
  name,
  hint,
  t = "blue",
}: {
  initials: string;
  name: string;
  hint?: string;
  t?: Tone;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-avatar border border-line bg-card py-1 pe-2.5 ps-1">
      <Avatar initials={initials} t={t} size={22} />
      <span className="min-w-0 truncate text-[0.75rem] font-medium text-heading">{name}</span>
      {hint && <span className="shrink-0 text-[0.6875rem] text-muted">{hint}</span>}
    </span>
  );
}

/* ------------------------------------------------------------ empty/load -- */

export function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon?: IconType;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-avatar"
          style={{ background: tone.slate.soft, color: tone.slate.text }}
        >
          <Icon size={22} />
        </span>
      )}
      <p className="text-[0.9375rem] font-semibold text-heading">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-muted">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-sm bg-light ${className}`} />;
}

/**
 * Placeholder shown while the store reads localStorage. Mirrors the real
 * layout — stat row, toolbar, table — so nothing shifts when the data lands.
 */
export function ModuleSkeleton({ rows = 6, stats = true }: { rows?: number; stats?: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {stats && (
        <Grid cols={4}>
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-3 h-5 w-16" />
              <Skeleton className="mt-3 h-2.5 w-24" />
            </Card>
          ))}
        </Grid>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
              <Skeleton className="h-9 w-9 rounded-avatar" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="ms-auto hidden h-3 w-24 sm:block" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

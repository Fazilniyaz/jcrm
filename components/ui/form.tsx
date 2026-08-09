"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Avatar, tone } from "@/components/ui";
import type { Tone } from "@/lib/ui/tone";

/*
 * Form controls for the CRUD modules. Same chrome as the rest of the product:
 * 0.1875rem radius, --input-border, --form-control-bg, primary focus ring.
 *
 * Every control takes an optional `error` and renders it under the field, so
 * validation looks identical everywhere without each form re-inventing it.
 */

const inputCls =
  "w-full rounded-sm border bg-form-bg px-3 text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary";

function borderFor(error?: string) {
  return error ? "border-danger" : "border-input-border";
}

/* ---------------------------------------------------------------- field -- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = "",
  hideLabel = false,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Keeps the label for screen readers but drops it from the layout. */
  hideLabel?: boolean;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className={
          hideLabel
            ? "sr-only"
            : "mb-1.5 flex items-center gap-1 text-[0.8125rem] font-medium text-heading"
        }
      >
        {label}
        {required && (
          <span aria-hidden style={{ color: "rgb(var(--danger-rgb))" }}>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-[0.6875rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[0.6875rem] text-muted">{hint}</p>
      )}
    </div>
  );
}

/** Two columns from `sm` up; `span` makes a field take the full width. */
export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Span({ children }: { children: React.ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}

/* ---------------------------------------------------------------- inputs -- */

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
  type = "text",
  disabled,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "url" | "date" | "password";
  disabled?: boolean;
  /** Offered through a datalist — the field still accepts anything typed. */
  suggestions?: string[];
}) {
  const id = useId();
  const listId = `${id}-list`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        list={suggestions ? listId : undefined}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`h-10 ${inputCls} ${borderFor(error)} disabled:cursor-not-allowed disabled:opacity-60`}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </Field>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  error,
  required,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  error?: string;
  required?: boolean;
  suffix?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <div className="relative">
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          aria-invalid={error ? true : undefined}
          className={`h-10 ${inputCls} ${borderFor(error)} ${suffix ? "pe-10" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[0.75rem] text-muted">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  rows?: number;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`resize-y py-2.5 leading-relaxed ${inputCls} ${borderFor(error)}`}
      />
    </Field>
  );
}

export function SelectInput<T extends string | number>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
  error?: string;
  required?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  const numeric = typeof value === "number";
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
    >
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange((numeric ? Number(e.target.value) : e.target.value) as T)}
          className={`h-10 appearance-none pe-9 ${inputCls} ${borderFor(error)}`}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </Field>
  );
}

/* ---------------------------------------------------------- multi select -- */

export type Option = { value: string; label: string; hint?: string; initials?: string; tone?: Tone };

/**
 * Checkbox popover with a search box. Used for assignees, reporting lines and
 * a task's projects — anywhere the answer is "one or more people/records".
 */
export function MultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  hint,
  error,
  required,
  emptyText = "Nothing to choose from",
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: Option[];
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  // The popover is positioned inside the modal's scrolling body, so opening one
  // near the bottom leaves it clipped. Pull it into view instead of trying to
  // portal out of the container.
  useEffect(() => {
    if (!open) return;
    pop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is Option => Boolean(o));

  const shown = q
    ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : options;

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <div ref={wrap} className="relative">
        <button
          type="button"
          id={id}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={`flex min-h-10 w-full items-center gap-2 rounded-sm border bg-form-bg px-2.5 py-1.5 text-start transition-colors focus:border-primary ${borderFor(
            error,
          )}`}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selected.length === 0 ? (
              <span className="py-1 text-[0.8125rem] text-muted">{placeholder}</span>
            ) : (
              selected.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-sm py-1 pe-1.5 ps-1.5 text-[0.75rem] font-medium"
                  style={{
                    background: tone[o.tone ?? "blue"].soft,
                    color: tone[o.tone ?? "blue"].text,
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  {/* A nested <button> is invalid inside a <button>, so the chip's
                      remove control is a span with a click handler. Keyboard users
                      untick the same row in the list below. */}
                  <span
                    role="presentation"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(o.value);
                    }}
                    className="-me-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-black/10"
                  >
                    <X size={11} />
                  </span>
                </span>
              ))
            )}
          </span>
          <ChevronDown size={15} className="shrink-0 text-muted" />
        </button>

        {open && (
          <div
            ref={pop}
            className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-card border border-line bg-card shadow-pop"
          >
            <div className="border-b border-line p-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter…"
                  aria-label={`Filter ${label}`}
                  className="h-8 w-full rounded-sm border border-input-border bg-form-bg ps-8 pe-2 text-[0.8125rem] text-text outline-none focus:border-primary"
                />
              </div>
            </div>
            <ul role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto py-1">
              {shown.length === 0 && (
                <li className="px-3 py-3 text-center text-[0.75rem] text-muted">{emptyText}</li>
              )}
              {shown.map((o) => {
                const on = value.includes(o.value);
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => toggle(o.value)}
                      className="flex w-full items-center gap-2.5 px-2.5 py-2 text-start transition-colors hover:bg-hover"
                    >
                      <span
                        aria-hidden
                        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          on ? "border-primary bg-primary text-white" : "border-line text-transparent"
                        }`}
                      >
                        <Check size={11} />
                      </span>
                      {o.initials && <Avatar initials={o.initials} t={o.tone ?? "blue"} size={24} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] text-heading">
                          {o.label}
                        </span>
                        {o.hint && (
                          <span className="block truncate text-[0.6875rem] text-muted">{o.hint}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Field>
  );
}

/* --------------------------------------------------------------- toggle -- */

export function SwitchField({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium text-heading">{label}</p>
        {desc && <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          checked ? "bg-primary" : "bg-light"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
            checked ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

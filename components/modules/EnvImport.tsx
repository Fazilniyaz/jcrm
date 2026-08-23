"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileUp, Plus } from "lucide-react";
import { Badge, Button, SectionLabel, tone } from "@/components/ui";
import { parseEnv } from "@/lib/env-import";
import { SECRET_ENVS, SECRET_ENV_FILE, type SecretEnv } from "@/lib/store/types";

/** Text formats worth reading. Anything else is binary as far as this is concerned. */
const IMPORTABLE = [".env", ".txt", ".csv", ".properties", ".ini", ".conf", ".cfg"];

/** Biggest a plausible .env gets. Past this, it is the wrong file. */
const MAX_BYTES = 512 * 1024;

/** Shows the first two and last two characters, never the middle. */
function mask(value: string): string {
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.min(18, value.length - 4))}${value.slice(-2)}`;
}

/**
 * Paste or drop a whole .env, instead of typing thirty rows.
 *
 * Nobody holds credentials as key/value pairs in a form — they hold a file, or
 * a block of text out of one. Retyping that by hand is slow and, worse, it is
 * where a character goes missing from a secret and an afternoon goes with it.
 *
 * Nothing is committed on parse. The preview is the point: it shows every value
 * that WOULD land, which of them replace something already in the vault, and
 * every line that could not be read — so an import is a decision rather than a
 * surprise.
 *
 * SECURITY: a .env is the most sensitive file in a repository, so it is read
 * with FileReader and parsed in this browser. The file is never uploaded
 * anywhere; only the pairs the person then accepts reach the vault.
 */
export default function EnvImport({
  existingKeys,
  onImport,
}: {
  /** Keys already in the vault, per environment, so the preview can say what it replaces. */
  existingKeys: (env: SecretEnv) => Set<string>;
  onImport: (entries: { key: string; value: string }[], env: SecretEnv) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [env, setEnv] = useState<SecretEnv>("local");
  const [parsed, setParsed] = useState<ReturnType<typeof parseEnv> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    setFileError("");

    const name = file.name.toLowerCase();
    // A .env has no extension at all, and browsers often report an empty type
    // for it — so "looks like text" has to accept more than `text/*`.
    const looksText =
      file.type.startsWith("text/") ||
      file.type === "" ||
      name.startsWith(".env") ||
      IMPORTABLE.some((extension) => name.endsWith(extension));

    if (!looksText) {
      setFileError(`${file.name} isn't a text file. Open it and paste the values instead.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError(`${file.name} is far too big to be a .env — is that the right file?`);
      return;
    }

    try {
      const content = await file.text();
      setText(content);
      setParsed(parseEnv(content));
    } catch {
      setFileError(`Couldn't read ${file.name}.`);
    }
  }

  function reset() {
    setOpen(false);
    setText("");
    setParsed(null);
    setFileError("");
  }

  if (!open) {
    return (
      <Button variant="ghost" icon={FileUp} onClick={() => setOpen(true)}>
        Import from .env
      </Button>
    );
  }

  const known = existingKeys(env);

  return (
    <div className="rounded-sm border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionLabel>Import from .env</SectionLabel>
        <button
          type="button"
          onClick={reset}
          className="text-[0.75rem] text-muted underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Cancel
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void readFile(file);
        }}
        className={`rounded-sm border border-dashed p-2 transition-colors ${
          dragging ? "border-primary bg-hover" : "border-line"
        }`}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // The preview belongs to the text it was parsed from; keeping a
            // stale one on screen while the box says something else is how a
            // person imports values they are no longer looking at.
            setParsed(null);
            setFileError("");
          }}
          rows={7}
          spellCheck={false}
          aria-label="Paste your .env contents"
          placeholder={`# Paste the whole file, or drop one here\nDATABASE_URL="mongodb+srv://..."\nexport JWT_SECRET=abc123\nPORT=4000`}
          className="w-full resize-y rounded-sm border border-input-border bg-form-bg p-2.5 font-mono text-[0.75rem] leading-relaxed text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
        />

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="text-[0.75rem] font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Choose a file
          </button>
          <span className="text-[0.6875rem] text-muted">
            .env, .txt, .csv or any plain-text config. Read in this browser, never uploaded.
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".env,.txt,.csv,.properties,.ini,.conf,.cfg,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              // Cleared so choosing the same file twice fires onChange again.
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {fileError && (
        <p role="alert" className="mt-2 text-[0.75rem]" style={{ color: tone.red.text }}>
          {fileError}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setParsed(parseEnv(text))} disabled={!text.trim()}>
          Parse
        </Button>
        <label className="flex items-center gap-1.5 text-[0.75rem] text-muted">
          Goes into
          <select
            value={env}
            onChange={(e) => setEnv(e.target.value as SecretEnv)}
            aria-label="Which environment file these values belong to"
            className="h-8 rounded-sm border border-input-border bg-form-bg px-2 text-[0.8125rem] text-text outline-none focus:border-primary"
          >
            {SECRET_ENVS.map((value) => (
              <option key={value} value={value}>
                {SECRET_ENV_FILE[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {parsed && (
        <div className="mt-2.5">
          {parsed.entries.length === 0 ? (
            <p className="text-[0.75rem] text-muted">
              Nothing readable in that. Lines need to look like <code>KEY=value</code>.
            </p>
          ) : (
            <>
              <p className="mb-1.5 text-[0.75rem] text-muted">
                {parsed.entries.length} value{parsed.entries.length === 1 ? "" : "s"} into{" "}
                <strong className="text-heading">{SECRET_ENV_FILE[env]}</strong>
              </p>
              <ul className="max-h-52 space-y-1 overflow-y-auto rounded-sm border border-line p-1.5">
                {parsed.entries.map((entry) => (
                  <li key={entry.key} className="flex items-center gap-2 text-[0.75rem]">
                    <Badge t={known.has(entry.key) ? "orange" : "blue"}>
                      {known.has(entry.key) ? "replaces" : "new"}
                    </Badge>
                    <span className="shrink-0 font-mono font-semibold text-heading">
                      {entry.key}
                    </span>
                    <span className="truncate font-mono text-muted">
                      {entry.value ? mask(entry.value) : "(empty)"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {parsed.skipped.length > 0 && (
            <div
              className="mt-2 rounded-sm p-2 text-[0.6875rem] leading-relaxed"
              style={{ background: tone.red.soft, color: tone.red.text }}
            >
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={12} />
                {parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"} couldn&apos;t be
                read, and will be left out
              </p>
              <ul className="mt-1 space-y-0.5">
                {parsed.skipped.slice(0, 6).map((skip) => (
                  <li key={`${skip.line}-${skip.text}`} className="font-mono">
                    line {skip.line}: {skip.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.entries.length > 0 && (
            <Button
              className="mt-2.5"
              icon={Plus}
              onClick={() => {
                onImport(parsed.entries, env);
                reset();
              }}
            >
              Add {parsed.entries.length} value{parsed.entries.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

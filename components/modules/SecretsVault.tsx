"use client";

import { useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldAlert,
  KeyRound,
  FileCode2,
} from "lucide-react";
import { Button, IconButton, SectionLabel, Badge, tone } from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import { useStore } from "@/lib/store/StoreProvider";
import { secretsByEnv, toEnvFile } from "@/lib/store/selectors";
import {
  SECRET_ENVS,
  SECRET_ENV_FILE,
  SECRET_ENV_TONE,
  type Project,
  type SecretEntry,
  type SecretEnv,
} from "@/lib/store/types";

/*
 * Per-project configuration vault.
 *
 * SECURITY: this is a frontend-only build, so values sit in localStorage in
 * plain text — any script on the page can read them and they are written to
 * disk. That is fine for placeholders and local URLs, and wrong for live
 * credentials. The warning below says so in the product, not just here,
 * because the person pasting a key is the one who needs to read it.
 *
 * The client portal never reaches this: canSeeSecrets() gates the whole
 * section, and the project detail only renders it for staff who deploy.
 */

/** Shows the first two and last two characters, never the middle. */
function mask(value: string): string {
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.min(18, value.length - 4))}${value.slice(-2)}`;
}

export default function SecretsVault({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const groups = secretsByEnv(project);

  const toggleReveal = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard can be blocked by permissions; the reveal toggle is the
      // fallback, so failing silently is better than an alert.
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted">
          <KeyRound size={14} />
          <SectionLabel>
            Vault — {project.secrets.length} value{project.secrets.length === 1 ? "" : "s"}
          </SectionLabel>
        </div>
        <Button variant="ghost" icon={Plus} onClick={() => setEditing(true)}>
          Manage
        </Button>
      </div>

      <p
        className="flex items-start gap-2 rounded-sm p-2.5 text-[0.6875rem] leading-relaxed"
        style={{ background: tone.red.soft, color: tone.red.text }}
      >
        <ShieldAlert size={13} className="mt-px shrink-0" />
        <span>
          Stored unencrypted in this browser&rsquo;s local storage. Fine for placeholders and local
          URLs — do not paste live production credentials.
        </span>
      </p>

      {groups.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line p-4 text-center text-[0.75rem] text-muted">
          No values saved for this project yet.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ env, file, entries }) => (
            <div key={env} className="overflow-hidden rounded-sm border border-line bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                <span className="flex items-center gap-2">
                  <FileCode2 size={13} className="text-muted" />
                  <code className="font-mono text-[0.75rem] font-semibold text-heading">
                    {file}
                  </code>
                  <Badge t={SECRET_ENV_TONE[env]}>{env}</Badge>
                </span>
                <button
                  type="button"
                  onClick={() => copy(`file-${env}`, toEnvFile(entries))}
                  className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted transition-colors hover:text-primary"
                >
                  {copied === `file-${env}` ? <Check size={12} /> : <Copy size={12} />}
                  {copied === `file-${env}` ? "Copied" : "Copy file"}
                </button>
              </div>

              <ul className="divide-y divide-line">
                {entries.map((s) => {
                  const shown = revealed.has(s.id);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <code className="shrink-0 font-mono text-[0.75rem] font-semibold text-heading">
                        {s.key}
                      </code>
                      <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-muted">
                        {shown ? s.value : mask(s.value)}
                      </code>
                      <span className="flex shrink-0 items-center gap-1">
                        <IconButton
                          icon={shown ? EyeOff : Eye}
                          label={shown ? `Hide ${s.key}` : `Reveal ${s.key}`}
                          size={28}
                          onClick={() => toggleReveal(s.id)}
                        />
                        <IconButton
                          icon={copied === s.id ? Check : Copy}
                          label={`Copy ${s.key}`}
                          size={28}
                          onClick={() => copy(s.id, s.value)}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <VaultEditor project={project} open={editing} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- editor -- */

let seq = 0;
const newRow = (): SecretEntry => ({
  id: `sec-${Date.now()}-${seq++}`,
  key: "",
  value: "",
  env: "local",
  updatedAt: new Date().toISOString().slice(0, 10),
  updatedBy: "",
});

/**
 * The vault editor, exported so the projects table can open it straight from a
 * row — the inline section below the plan is for reading, this is for editing,
 * and burying the only way in six sections deep made it undiscoverable.
 */
export function VaultEditor({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  const { setProjectSecrets, currentUser } = useStore();
  const [rows, setRows] = useState<SecretEntry[]>(() =>
    project.secrets.length ? project.secrets.map((s) => ({ ...s })) : [newRow()],
  );
  const [error, setError] = useState("");

  const set = (id: string, patch: Partial<SecretEntry>) =>
    setRows((r) => r.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function save() {
    const filled = rows.filter((s) => s.key.trim());
    // Same key twice in the same file is a real mistake — the later one would
    // silently win when the file is written.
    const seen = new Set<string>();
    for (const s of filled) {
      const k = `${s.env}:${s.key.trim()}`;
      if (seen.has(k)) {
        setError(`${s.key.trim()} appears twice in ${SECRET_ENV_FILE[s.env]}.`);
        return;
      }
      seen.add(k);
    }

    setProjectSecrets(
      project.id,
      filled.map((s) => ({
        ...s,
        key: s.key.trim(),
        value: s.value,
        note: s.note?.trim() || undefined,
        updatedAt: new Date().toISOString().slice(0, 10),
        updatedBy: currentUser,
      })),
    );
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Vault — ${project.code}`}
      desc="Configuration values kept against this project. Never shown to the client."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Save} onClick={save}>
            Save vault
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p
          className="flex items-start gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
          style={{ background: tone.red.soft, color: tone.red.text }}
        >
          <ShieldAlert size={14} className="mt-px shrink-0" />
          <span>
            <strong>Plain text, in this browser.</strong> Anything typed here is stored unencrypted
            in local storage and is readable by any script running on this page. Use it for
            placeholders, local URLs and sandbox keys — not for live secrets.
          </span>
        </p>

        {error && (
          <p role="alert" className="text-[0.75rem]" style={{ color: tone.red.text }}>
            {error}
          </p>
        )}

        <ul className="space-y-2">
          {rows.map((s, i) => (
            <li key={s.id} className="rounded-sm border border-line bg-card p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={s.key}
                  onChange={(e) => {
                    set(s.id, { key: e.target.value.toUpperCase().replace(/\s+/g, "_") });
                    setError("");
                  }}
                  placeholder="API_KEY"
                  aria-label={`Key ${i + 1}`}
                  className="h-9 w-full min-w-0 rounded-sm border border-input-border bg-form-bg px-2.5 font-mono text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary sm:w-48"
                />
                <input
                  value={s.value}
                  onChange={(e) => set(s.id, { value: e.target.value })}
                  placeholder="value"
                  aria-label={`Value ${i + 1}`}
                  className="h-9 min-w-0 flex-1 rounded-sm border border-input-border bg-form-bg px-2.5 font-mono text-[0.8125rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
                />
                <select
                  value={s.env}
                  onChange={(e) => {
                    set(s.id, { env: e.target.value as SecretEnv });
                    setError("");
                  }}
                  aria-label={`Environment ${i + 1}`}
                  className="h-9 shrink-0 rounded-sm border border-input-border bg-form-bg px-2 text-[0.8125rem] text-text outline-none focus:border-primary"
                >
                  {SECRET_ENVS.map((env) => (
                    <option key={env} value={env}>
                      {SECRET_ENV_FILE[env]}
                    </option>
                  ))}
                </select>
                <IconButton
                  icon={Trash2}
                  label={`Remove ${s.key || `row ${i + 1}`}`}
                  size={30}
                  onClick={() => setRows((r) => r.filter((x) => x.id !== s.id))}
                />
              </div>

              <input
                value={s.note ?? ""}
                onChange={(e) => set(s.id, { note: e.target.value })}
                placeholder="What this is for (optional)"
                aria-label={`Note ${i + 1}`}
                className="mt-2 h-8 w-full rounded-sm border border-input-border bg-form-bg px-2.5 text-[0.75rem] text-text outline-none transition-colors placeholder:text-muted focus:border-primary"
              />
            </li>
          ))}
        </ul>

        <Button variant="ghost" icon={Plus} onClick={() => setRows((r) => [...r, newRow()])}>
          Add value
        </Button>
      </div>
    </Modal>
  );
}

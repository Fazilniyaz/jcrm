"use client";

/*
 * My Profile — the one screen that is about you rather than the work.
 *
 * Picture, display name, and the status line everyone else sees next to it.
 * Available to everybody: this is not an admin surface, it is the equivalent
 * of the profile menu in any chat tool.
 *
 * The picture is squared and compressed IN THE BROWSER before it is sent. A
 * phone photo is several megabytes; the API takes a data URL on the user row,
 * and shipping the original would both be refused and be the wrong thing to
 * store on something read on every screen that draws a face.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  Camera,
  Check,
  CircleDot,
  Loader2,
  Moon,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ModuleSkeleton,
  tone,
} from "@/components/ui";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { TextInput } from "@/components/ui/form";
import {
  useGetProfileQuery,
  useSetStatusMutation,
  useTouchPresenceMutation,
  useUpdateProfileMutation,
} from "@/lib/api/api";
import { apiErrorMessage } from "@/lib/api/baseQuery";
import { useSession } from "@/lib/api/session";
import type { IconType } from "@/lib/ui/icon";

/** 128px square, JPEG. Comfortably inside the API's size cap. */
const AVATAR_PX = 128;
const MAX_UPLOAD_MB = 8;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/* ------------------------------------------------------------- statuses -- */

type Preset = { emoji: string; text: string; label: string; minutes: number | null };

/** The handful people actually use, with the duration that goes with each. */
const PRESETS: Preset[] = [
  { emoji: "📅", text: "In a meeting", label: "1 hour", minutes: 60 },
  { emoji: "🚌", text: "Commuting", label: "30 minutes", minutes: 30 },
  { emoji: "🤒", text: "Out sick", label: "Today", minutes: null },
  { emoji: "🌴", text: "Vacationing", label: "Today", minutes: null },
  { emoji: "🏠", text: "Working remotely", label: "Today", minutes: null },
  { emoji: "🎯", text: "Focusing", label: "2 hours", minutes: 120 },
];

const DURATIONS: { value: string; label: string; minutes: number | null }[] = [
  { value: "none", label: "Don't clear", minutes: null },
  { value: "30", label: "30 minutes", minutes: 30 },
  { value: "60", label: "1 hour", minutes: 60 },
  { value: "240", label: "4 hours", minutes: 240 },
  { value: "today", label: "Today", minutes: -1 },
];

/** -1 means "end of today"; null means never. */
function expiryFrom(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes === -1) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/* =============================================================== module == */

export function Me() {
  const session = useSession();
  const signedIn = session.status === "user";

  const { data: profile, isLoading } = useGetProfileQuery(undefined, { skip: !signedIn });
  const [updateProfile, saveState] = useUpdateProfileMutation();
  const [setStatus, statusState] = useSetStatusMutation();
  const [touchPresence] = useTouchPresenceMutation();

  const me = signedIn ? session.user : null;

  const [name, setName] = useState("");
  const [statusText, setStatusText] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("");
  const [duration, setDuration] = useState("none");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seeded from the session once it lands, then left alone so typing is not
  // overwritten by a refetch.
  useEffect(() => {
    if (!me) return;
    setName((n) => (n === "" ? me.name : n));
    setStatusText((t) => (t === "" ? (me.status?.text ?? "") : t));
    setStatusEmoji((e) => (e === "" ? (me.status?.emoji ?? "") : e));
  }, [me]);

  const away = me?.presenceMode === "away";

  const dirtyName = Boolean(me && name.trim() && name.trim() !== me.name);
  const dirtyStatus = Boolean(
    me && (statusText !== (me.status?.text ?? "") || statusEmoji !== (me.status?.emoji ?? "")),
  );

  if (!signedIn) {
    return (
      <Card>
        <EmptyState
          icon={UserRound}
          title="Sign in to edit your profile"
          desc="Your picture, name and status live on your account, so the demo portals have none."
        />
      </Card>
    );
  }

  if (isLoading && !me) return <ModuleSkeleton rows={4} />;

  async function pickPicture(file: File) {
    setError(null);
    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Pick something under ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      /*
       * Compress, then square it by drawing the centre crop. The API stores
       * this string on the row, so the size here is the size forever.
       */
      const small = await imageCompression(file, {
        maxWidthOrHeight: AVATAR_PX,
        maxSizeMB: 0.1,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      const dataUrl = await squareToDataUrl(small);
      await updateProfile({ avatar: dataUrl }).unwrap();
      setMessage("Picture updated.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't use that picture."));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    setMessage(null);
    try {
      if (dirtyName) await updateProfile({ name: name.trim() }).unwrap();
      if (dirtyStatus) {
        const minutes = DURATIONS.find((d) => d.value === duration)?.minutes ?? null;
        await setStatus({
          text: statusText.trim() || null,
          emoji: statusEmoji.trim() || null,
          until: statusText.trim() ? expiryFrom(minutes) : null,
        }).unwrap();
      }
      setMessage("Saved.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save that."));
    }
  }

  async function applyPreset(p: Preset) {
    setStatusEmoji(p.emoji);
    setStatusText(p.text);
    setError(null);
    try {
      await setStatus({
        text: p.text,
        emoji: p.emoji,
        until: expiryFrom(p.minutes ?? -1),
      }).unwrap();
      setMessage(`Status set — ${p.text}.`);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't set that status."));
    }
  }

  async function clearStatus() {
    setStatusText("");
    setStatusEmoji("");
    try {
      await setStatus({ text: null, emoji: null, until: null }).unwrap();
      setMessage("Status cleared.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't clear that."));
    }
  }

  const saving = saveState.isLoading || statusState.isLoading || busy;

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      {/* ---------------------------------------------------------- you -- */}
      <div className="space-y-4 xl:col-span-5">
        <Card>
          <CardHeader title="Your profile" desc="How you appear everywhere in the workspace." />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="relative">
                <PersonAvatar
                  name={me?.name}
                  initials={initialsOf(name || me?.name || "?")}
                  avatar={me?.avatar}
                  size={76}
                  presence={me?.presence}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  aria-label="Change profile picture"
                  className="absolute -bottom-1 -start-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-muted shadow-card transition-colors hover:text-primary"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                </button>
              </span>

              <div className="min-w-0 space-y-1.5">
                <Button variant="ghost" icon={Camera} onClick={() => fileRef.current?.click()}>
                  Upload a photo
                </Button>
                {me?.avatar && (
                  <Button
                    variant="danger"
                    icon={Trash2}
                    onClick={() => void updateProfile({ avatar: null })}
                  >
                    Remove
                  </Button>
                )}
                <p className="text-[0.6875rem] text-muted">
                  Squared and shrunk to {AVATAR_PX}px here before it is sent.
                </p>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Reset first: picking the same file twice must still fire.
                e.target.value = "";
                if (f) void pickPicture(f);
              }}
            />

            <TextInput label="Display name" value={name} onChange={setName} />

            <div className="rounded-sm border border-line p-3">
              <p className="mb-2 text-[0.75rem] font-medium text-heading">Availability</p>
              <div className="flex gap-1.5">
                <PresenceChip
                  on={!away}
                  icon={CircleDot}
                  label="Active"
                  colour="rgb(var(--success-vivid-rgb))"
                  onClick={() => void touchPresence({ presence: "auto" })}
                />
                <PresenceChip
                  on={away}
                  icon={Moon}
                  label="Away"
                  colour="rgb(var(--warning-vivid-rgb))"
                  onClick={() => void touchPresence({ presence: "away" })}
                />
              </div>
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
                The green dot is live: it follows the app being open, so it goes out on its own
                when you close it. Away overrides that while you stay signed in.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------------- status -- */}
      <div className="xl:col-span-7">
        <Card>
          <CardHeader
            title="Set a status"
            desc="A short line next to your name, with an expiry so you don't have to remember to clear it."
            action={
              (me?.status?.text || me?.status?.emoji) && (
                <Button variant="ghost" onClick={() => void clearStatus()}>
                  Clear
                </Button>
              )
            }
          />
          <CardBody className="space-y-4">
            <div className="flex gap-2">
              <input
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value)}
                placeholder="🙂"
                aria-label="Status emoji"
                maxLength={4}
                className="h-10 w-14 rounded-card border border-input-border bg-form-bg text-center text-[1.125rem] outline-none focus:border-primary"
              />
              <input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="What's your status?"
                aria-label="Status"
                maxLength={100}
                className="h-10 min-w-0 flex-1 rounded-card border border-input-border bg-form-bg px-3 text-[0.875rem] text-heading outline-none placeholder:text-muted focus:border-primary"
              />
            </div>

            <label className="flex items-center gap-2 text-[0.75rem] text-muted">
              Clear after
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="h-9 rounded-card border border-input-border bg-form-bg px-2 text-[0.8125rem] text-heading outline-none focus:border-primary"
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                Quick picks
              </p>
              <ul className="space-y-1">
                {PRESETS.map((p) => (
                  <li key={p.text}>
                    <button
                      type="button"
                      onClick={() => void applyPreset(p)}
                      className="flex w-full items-center gap-2.5 rounded-card border border-line px-3 py-2 text-left transition-colors hover:border-primary hover:bg-hover"
                    >
                      <span className="text-[1rem]">{p.emoji}</span>
                      <span className="flex-1 text-[0.8125rem] font-medium text-heading">
                        {p.text}
                      </span>
                      <span className="text-[0.6875rem] text-muted">{p.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button icon={Check} onClick={() => void save()} disabled={saving || (!dirtyName && !dirtyStatus)}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {message && <span className="text-[0.75rem] text-muted">{message}</span>}
              {error && (
                <span className="text-[0.75rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
                  {error}
                </span>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PresenceChip({
  on,
  icon: Icon,
  label,
  colour,
  onClick,
}: {
  on: boolean;
  icon: IconType;
  label: string;
  colour: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-card border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
        on ? "border-transparent text-heading" : "border-line text-muted hover:bg-hover"
      }`}
      style={on ? { background: tone.sky.soft } : undefined}
    >
      <Icon size={13} style={{ color: on ? colour : undefined }} />
      {label}
    </button>
  );
}

/**
 * Centre-crop to a square and return a data URL.
 *
 * Done after compression so the canvas work is on a small image, and because a
 * non-square avatar in a round frame is the thing everyone notices.
 */
function squareToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_PX;
      canvas.height = AVATAR_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Canvas unavailable."));
      }
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_PX,
        AVATAR_PX,
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    img.src = url;
  });
}

export default Me;

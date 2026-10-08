"use client";

/*
 * The profile panel — what used to be the "My Profile" module.
 *
 * It lives on the header avatar because that is where people look for it in
 * every other tool, and because a sidebar entry for "you" sat oddly among
 * fifteen entries for the company's work. The content is the same: your
 * picture, your display name, whether you are around, and the status line
 * everyone sees next to your name.
 *
 * It opens on HOVER and closes when the pointer leaves — but not while it is
 * being used. A panel that vanished mid-sentence because the mouse drifted
 * would be unusable, so a click pins it open and so does putting the cursor in
 * any field inside it; only an outside click or Escape closes a pinned panel.
 * Touch has no hover at all, where the same click is the whole interaction.
 *
 * The picture is squared and compressed IN THE BROWSER before it is sent. A
 * phone photo is several megabytes; the API stores a data URL on the user row,
 * and shipping the original would both be refused and be the wrong thing to
 * keep on something drawn on every screen that shows a face.
 */

import { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  Camera,
  Check,
  CircleDot,
  Loader2,
  LogOut,
  Moon,
  Trash2,
} from "lucide-react";
import { Button, tone } from "@/components/ui";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { TextInput } from "@/components/ui/form";
import {
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

/** How long the panel waits after the pointer leaves before closing. */
const CLOSE_DELAY_MS = 260;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

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

export default function ProfilePanel({
  user,
  role,
  email,
  onLogout,
}: {
  user: string;
  role: string;
  /** Present only for an account signed into the API. */
  email?: string;
  onLogout: () => void;
}) {
  const session = useSession();
  const signedIn = session.status === "user";
  const me = signedIn ? session.user : null;

  const [open, setOpen] = useState(false);
  /** Pinned panels ignore the pointer leaving — see the header comment. */
  const [pinned, setPinned] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [updateProfile, saveState] = useUpdateProfileMutation();
  const [setStatus, statusState] = useSetStatusMutation();
  const [touchPresence] = useTouchPresenceMutation();

  /*
   * Drafts, not copies.
   *
   * Each field is null until it is touched, and reads through to the session
   * value while it is. So the panel always opens showing what is actually
   * saved — including a change made in another tab, which arrives over the
   * socket — and typing is never overwritten by that refetch. Seeding state
   * from the session in an effect would do neither: it fights the refetch and
   * goes stale on reopen.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [emojiDraft, setEmojiDraft] = useState<string | null>(null);
  const [duration, setDuration] = useState("none");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const savedName = me?.name ?? user;
  const savedText = me?.status?.text ?? "";
  const savedEmoji = me?.status?.emoji ?? "";

  const name = nameDraft ?? savedName;
  const statusText = textDraft ?? savedText;
  const statusEmoji = emojiDraft ?? savedEmoji;

  /** Forget the drafts, so the fields read through to the saved values again. */
  const resetDrafts = () => {
    setNameDraft(null);
    setTextDraft(null);
    setEmojiDraft(null);
  };

  // Outside click and Escape close it, pinned or not.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setPinned(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const enter = () => {
    cancelClose();
    setOpen(true);
  };

  const leave = () => {
    cancelClose();
    if (pinned) return;
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  const away = me?.presenceMode === "away";
  const initials = initialsOf(user);

  const dirtyName = Boolean(me && name.trim() && name.trim() !== savedName);
  const dirtyStatus = Boolean(me && (statusText !== savedText || statusEmoji !== savedEmoji));
  const saving = saveState.isLoading || statusState.isLoading || busy;

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
      resetDrafts();
      setMessage("Saved.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save that."));
    }
  }

  async function applyPreset(p: Preset) {
    setError(null);
    try {
      await setStatus({ text: p.text, emoji: p.emoji, until: expiryFrom(p.minutes ?? -1) }).unwrap();
      // The preset IS the saved value now, so drop the drafts rather than
      // setting them — otherwise the fields would stop tracking the account.
      resetDrafts();
      setMessage(`Status set — ${p.text}.`);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't set that status."));
    }
  }

  async function clearStatus() {
    try {
      await setStatus({ text: null, emoji: null, until: null }).unwrap();
      resetDrafts();
      setMessage("Status cleared.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't clear that."));
    }
  }

  return (
    <div
      ref={wrap}
      className="relative"
      onPointerEnter={enter}
      onPointerLeave={leave}
      // Tabbing into anything inside pins it: a panel that closed because the
      // pointer was elsewhere would eat whatever was being typed.
      onFocusCapture={() => {
        cancelClose();
        setOpen(true);
        setPinned(true);
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o || !pinned);
          setPinned((p) => !(open && p));
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-card py-1 ps-1 pe-1.5 transition-colors hover:bg-hover"
      >
        <span className="relative inline-flex">
          {me ? (
            <PersonAvatar
              name={me.name}
              initials={initials}
              avatar={me.avatar}
              size={32}
              presence={me.presence}
            />
          ) : (
            <span className="pk-hero inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold">
              {initials}
            </span>
          )}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[9rem] truncate text-[0.8125rem] font-semibold text-heading">
            {user}
          </span>
          <span className="block max-w-[9rem] truncate text-[0.6875rem] text-muted">{role}</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your profile"
          className="pk-menu absolute right-0 z-30 mt-1.5 max-h-[min(34rem,calc(100vh-5rem))] w-[21rem] overflow-y-auto overscroll-contain rounded-card border border-line bg-card shadow-pop"
        >
          {/* who you are */}
          <div className="pk-hero flex items-center gap-3 px-4 py-4">
            <span className="shrink-0">
              {me ? (
                <PersonAvatar
                  name={me.name}
                  initials={initials}
                  avatar={me.avatar}
                  size={44}
                  presence={me.presence}
                />
              ) : (
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-[0.875rem] font-bold"
                  style={{ background: "rgba(255,255,255,0.18)", color: "var(--on-hero)" }}
                  aria-hidden
                >
                  {initials}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.9375rem] font-semibold">{user}</span>
              <span className="block truncate text-[0.75rem]">{email ?? role}</span>
              {me?.status?.text && (
                <span className="mt-0.5 block truncate text-[0.75rem]">
                  {me.status.emoji} {me.status.text}
                </span>
              )}
            </span>
          </div>

          {signedIn ? (
            <div className="space-y-3.5 p-3.5">
              {/* picture + name */}
              <div className="flex items-center gap-3">
                <span className="relative shrink-0">
                  <PersonAvatar
                    name={me?.name}
                    initials={initialsOf(name || user)}
                    avatar={me?.avatar}
                    size={56}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    aria-label="Change profile picture"
                    className="absolute -bottom-1 -start-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-muted shadow-card transition-colors hover:text-primary"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </button>
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-[0.75rem] font-semibold text-primary hover:underline"
                  >
                    Upload a photo
                  </button>
                  {me?.avatar && (
                    <button
                      type="button"
                      onClick={() => void updateProfile({ avatar: null })}
                      className="flex items-center gap-1 text-[0.6875rem] font-medium"
                      style={{ color: "rgb(var(--danger-rgb))" }}
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                  <p className="text-[0.625rem] leading-snug text-muted">
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

              <TextInput label="Display name" value={name} onChange={setNameDraft} />

              {/* availability */}
              <div className="rounded-sm border border-line p-2.5">
                <p className="mb-1.5 text-[0.75rem] font-medium text-heading">Availability</p>
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
                <p className="mt-1.5 text-[0.625rem] leading-relaxed text-muted">
                  The green dot follows the app being open, so it goes out on its own. Away
                  overrides that while you stay signed in.
                </p>
              </div>

              {/* status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                    Your status
                  </p>
                  {(me?.status?.text || me?.status?.emoji) && (
                    <button
                      type="button"
                      onClick={() => void clearStatus()}
                      className="text-[0.6875rem] font-semibold text-primary hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={statusEmoji}
                    onChange={(e) => setEmojiDraft(e.target.value)}
                    placeholder="🙂"
                    aria-label="Status emoji"
                    maxLength={4}
                    className="h-9 w-12 rounded-card border border-input-border bg-form-bg text-center text-[1rem] outline-none focus:border-primary"
                  />
                  <input
                    value={statusText}
                    onChange={(e) => setTextDraft(e.target.value)}
                    placeholder="What's your status?"
                    aria-label="Status"
                    maxLength={100}
                    className="h-9 min-w-0 flex-1 rounded-card border border-input-border bg-form-bg px-2.5 text-[0.8125rem] text-heading outline-none placeholder:text-muted focus:border-primary"
                  />
                </div>
                <label className="flex items-center gap-2 text-[0.6875rem] text-muted">
                  Clear after
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="h-8 flex-1 rounded-card border border-input-border bg-form-bg px-2 text-[0.75rem] text-heading outline-none focus:border-primary"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>

                <ul className="grid grid-cols-2 gap-1">
                  {PRESETS.map((p) => (
                    <li key={p.text}>
                      <button
                        type="button"
                        onClick={() => void applyPreset(p)}
                        title={`${p.text} · ${p.label}`}
                        className="flex w-full items-center gap-1.5 rounded-card border border-line px-2 py-1.5 text-left transition-colors hover:border-primary hover:bg-hover"
                      >
                        <span className="text-[0.875rem]">{p.emoji}</span>
                        <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium text-heading">
                          {p.text}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button
                  icon={Check}
                  onClick={() => void save()}
                  disabled={saving || (!dirtyName && !dirtyStatus)}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
                {message && <span className="text-[0.6875rem] text-muted">{message}</span>}
                {error && (
                  <span className="text-[0.6875rem]" style={{ color: "rgb(var(--danger-rgb))" }}>
                    {error}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="px-4 py-3 text-[0.75rem] leading-relaxed text-muted">
              Your picture, name and status live on your account, so a demo portal has none.
            </p>
          )}

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-card px-2.5 py-2 text-left text-[0.8125rem] font-medium transition-colors hover:bg-hover"
              style={{ color: "rgb(var(--danger-rgb))" }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-card"
                style={{ background: "var(--danger-soft)" }}
              >
                <LogOut size={14} />
              </span>
              Sign out
            </button>
          </div>
        </div>
      )}
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
      className={`flex items-center gap-1.5 rounded-card border px-2.5 py-1 text-[0.75rem] font-medium transition-colors ${
        on ? "border-transparent text-heading" : "border-line text-muted hover:bg-hover"
      }`}
      style={on ? { background: tone.sky.soft } : undefined}
    >
      <Icon size={12} style={{ color: on ? colour : undefined }} />
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

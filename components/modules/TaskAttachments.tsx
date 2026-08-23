"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  Paperclip,
  Download,
  Trash2,
  UploadCloud,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  Loader2,
} from "lucide-react";
import { IconButton, SectionLabel, tone } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/overlay";
import {
  useDeleteTaskAttachmentMutation,
  useListTaskAttachmentsQuery,
  useUploadTaskAttachmentMutation,
} from "@/lib/api/api";
import { useSession } from "@/lib/api/session";
import type { TaskAttachment } from "@/lib/api/types";
import { API_ROOT, getAccessToken } from "@/lib/api/token";

/*
 * Files on a task.
 *
 * Only rendered when someone is signed into the API — the local demo store has
 * no attachments and never will, so the whole block is absent rather than
 * showing an empty list that can never fill.
 */

/** Mirrors the server's allowlist. Rejecting here saves a pointless round trip. */
const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
];

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Icon and tint by file family.
 *
 * The same blue document glyph on every row is decoration: it fills space and
 * tells you nothing you could not read from the filename. Split by family and
 * the column becomes scannable — you can find the one spreadsheet in a list of
 * twelve screenshots without reading a single name.
 */
function fileGlyph(mimeType: string): { icon: typeof FileText; t: "blue" | "sky" | "orange" | "slate" } {
  if (mimeType.startsWith("image/")) return { icon: FileImage, t: "sky" };
  if (mimeType === "application/zip") return { icon: FileArchive, t: "slate" };
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") {
    return { icon: FileSpreadsheet, t: "orange" };
  }
  return { icon: FileText, t: "blue" };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Image types worth compressing before upload.
 *
 * Not every image: an animated GIF is drawn to a canvas to be re-encoded, which
 * flattens it to a single frame and loses the animation the person uploaded it
 * for. The three below are the ones where re-encoding is lossless in intent —
 * a screenshot at 4000px is a screenshot at 1600px, only smaller.
 */
const COMPRESSIBLE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Shrink an image before it leaves the browser.
 *
 * A phone photo is routinely 6 MB of pixels nobody will ever look at at full
 * size, and every one of those bytes costs the uploader's connection, the
 * server's memory and the object store's quota. Resized to 1600px on its long
 * edge at quality 0.8 the same photo is a few hundred KB and looks identical in
 * a task drawer. The work happens in a worker so a large image does not freeze
 * the page while it re-encodes.
 *
 * Best-effort by design: anything that goes wrong — an unsupported codec, a
 * worker that will not start, a result that came back bigger than the original
 * or with a type the server does not accept — falls through to the untouched
 * file. Compression is an optimisation, never a gate on the upload succeeding.
 */
async function compressed(file: File): Promise<File> {
  if (!COMPRESSIBLE_MIME_TYPES.includes(file.type)) return file;
  try {
    const result = await imageCompression(file, {
      maxWidthOrHeight: 1600,
      initialQuality: 0.8,
      useWebWorker: true,
      // Held to the original type so the result still matches the server's
      // allowlist and the extension it will be stored under.
      fileType: file.type,
    });
    if (result.size === 0 || result.size >= file.size) return file;
    if (!ACCEPTED_MIME_TYPES.includes(result.type)) return file;
    // `imageCompression` returns a File already, but its name is not guaranteed
    // to survive every code path; rebuilt so the server always gets the name the
    // person chose.
    return new File([result], file.name, { type: result.type });
  } catch {
    return file;
  }
}

/**
 * The client-side half of the size and type checks.
 *
 * Deliberately the same rules as the server, and deliberately not trusted by
 * it: this exists so a 40 MB file is refused instantly instead of being
 * uploaded for thirty seconds and then rejected. The server re-checks
 * everything, because anything decided here can be skipped.
 */
function rejectionReason(file: File): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_BYTES) return `${file.name} is over the 10 MB limit.`;
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) return `${file.name} isn't an accepted file type.`;
  return null;
}

/**
 * Fetch an attachment's bytes with the bearer token attached.
 *
 * The download route is authenticated, so the bytes cannot be reached by
 * pointing an `<img src>` or an `<a href>` at it — a browser would send that
 * request anonymously and collect a 401. Everything that wants the bytes goes
 * through here instead. When the file lives in the object store the route
 * answers with a 302 to a short-lived signed URL and `fetch` follows it for us;
 * the Authorization header is dropped on that cross-origin hop by the fetch
 * spec itself, so the token never reaches the store.
 */
async function fetchAttachment(taskId: string, attachmentId: string, width?: number) {
  const query = width ? `?w=${width}` : "";
  const response = await fetch(
    `${API_ROOT}/tasks/${taskId}/attachments/${attachmentId}/download${query}`,
    {
      credentials: "include",
      headers: { authorization: `Bearer ${getAccessToken() ?? ""}` },
    },
  );
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}

/** Rendered thumbnail width, in CSS pixels, doubled for the request so it stays sharp on a 2x screen. */
const THUMB_PX = 32;

/**
 * An image row's own thumbnail, in place of the generic image glyph.
 *
 * A list of eight screenshots all showing the same blue picture icon is a list
 * you have to read; the same list showing the actual images is one you can
 * scan. The server delivers these through the same authorised route as the full
 * download, transformed to `f-auto,q-auto` at thumbnail width — a few KB, not
 * the whole file.
 *
 * Falls back to the glyph silently: a thumbnail is a nicety, and a broken image
 * box would be a worse row than the icon it replaced.
 */
function AttachmentThumb({
  taskId,
  attachmentId,
  fallback,
}: {
  taskId: string;
  attachmentId: string;
  fallback: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const blob = await fetchAttachment(taskId, attachmentId, THUMB_PX * 2);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        // Keeps the glyph.
      }
    })();

    return () => {
      cancelled = true;
      // Revoked on unmount either way — an un-revoked object URL holds the
      // whole blob in memory for the life of the document.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [taskId, attachmentId]);

  if (!src) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, which
    // next/image cannot optimise and does not need to; the bytes are already
    // thumbnail-sized and came from the API's own transform.
    <img
      src={src}
      alt=""
      aria-hidden
      className="h-8 w-8 shrink-0 rounded-sm border border-line object-cover"
    />
  );
}

export default function TaskAttachments({
  taskId,
  subtaskId,
}: {
  taskId: string;
  /** When set, the files belong to this subtask rather than the task itself. */
  subtaskId?: string;
}) {
  // Attachments are an API-only feature; a demo portal has no task rows on
  // the server to hang a file from.
  const signedIn = useSession().status === "user";
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  /** The row whose removal is waiting to be confirmed. */
  const [pendingDelete, setPendingDelete] = useState<TaskAttachment | null>(null);
  /** Rows whose delete request is still in flight, so each row can show its own spinner. */
  const [removing, setRemoving] = useState<string[]>([]);

  const { data: attachments = [], isLoading } = useListTaskAttachmentsQuery(
    { taskId, subtaskId },
    { skip: !signedIn },
  );
  const [upload, { isLoading: uploading }] = useUploadTaskAttachmentMutation();
  const [remove] = useDeleteTaskAttachmentMutation();

  /**
   * Remove one file, once it has been confirmed.
   *
   * The row disappears from the list immediately — the mutation drops it from
   * the cache optimistically and puts it back if the server refuses — so the
   * spinner here is for the row's own button during the seconds the request is
   * actually in flight, which on this deployment is several.
   */
  const confirmDelete = useCallback(
    async (file: TaskAttachment) => {
      setError(null);
      setRemoving((ids) => [...ids, file.id]);
      try {
        await remove({ taskId, subtaskId, attachmentId: file.id }).unwrap();
      } catch {
        setError(`Couldn't remove ${file.fileName}.`);
      } finally {
        setRemoving((ids) => ids.filter((id) => id !== file.id));
      }
    },
    [remove, taskId, subtaskId],
  );

  const send = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);

      // Sequential, not Promise.all: the server takes one file per request and
      // rate-limits uploads, so firing six at once would earn a 429 for the
      // last few and look like a random failure.
      for (const file of Array.from(files)) {
        const reason = rejectionReason(file);
        if (reason) {
          setError(reason);
          continue;
        }
        try {
          // Checked BEFORE compression, against the file the person actually
          // picked: a 40 MB image that compresses under the limit is still a
          // 40 MB decode in this tab, and the rule they were told about is
          // about the file they chose.
          await upload({ taskId, subtaskId, file: await compressed(file) }).unwrap();
        } catch {
          setError(`Couldn't upload ${file.name}.`);
        }
      }
    },
    [taskId, subtaskId, upload],
  );

  /**
   * Download through fetch, not a plain link.
   *
   * The route requires the bearer token, and an <a href> cannot carry an
   * Authorization header — the browser would send an anonymous request and get
   * a 401. So the bytes are fetched with the header attached and handed to the
   * user as a blob. The trade is that the URL is not shareable, which is the
   * correct behaviour for a tenant's private file anyway.
   */
  const download = useCallback(
    async (attachmentId: string, fileName: string) => {
      setError(null);
      setDownloading(attachmentId);
      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(await fetchAttachment(taskId, attachmentId));
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        link.click();
      } catch {
        setError(`Couldn't download ${fileName}.`);
      } finally {
        // Revoked either way — an un-revoked object URL holds the whole file in
        // memory for the life of the document.
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setDownloading(null);
      }
    },
    [taskId],
  );

  if (!signedIn) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        <Paperclip size={14} />
        <SectionLabel>Attachments ({attachments.length})</SectionLabel>
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
          void send(e.dataTransfer.files);
        }}
        className={`rounded-sm border border-dashed p-4 text-center transition-colors ${
          dragging ? "border-primary bg-hover" : "border-line"
        }`}
      >
        <UploadCloud size={20} className="mx-auto mb-1.5 text-muted" />
        <p className="text-[0.75rem] text-muted">
          Drop a file here, or{" "}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            browse
          </button>
          .
        </p>
        <p className="mt-1 text-[0.6875rem] text-muted">
          Images, PDF, Office documents, text, CSV or zip. Up to 10 MB each.
        </p>

        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_MIME_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => {
            void send(e.target.files);
            // Cleared so choosing the same file twice in a row fires onChange
            // the second time.
            e.target.value = "";
          }}
        />
      </div>

      {uploading && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-muted">
          <Loader2 size={13} className="animate-spin" />
          Uploading…
        </p>
      )}

      {error && (
        <p
          className="mt-2 rounded-sm px-2 py-1.5 text-[0.75rem] font-medium"
          style={{ background: tone.red.soft, color: tone.red.text }}
          role="alert"
        >
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-3 text-[0.75rem] text-muted">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="mt-3 text-[0.75rem] text-muted">Nothing attached yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-sm border border-line bg-card">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-2.5 p-2.5">
              {(() => {
                const glyph = fileGlyph(file.mimeType);
                const icon = (
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm"
                    style={{ background: tone[glyph.t].soft, color: tone[glyph.t].text }}
                  >
                    <glyph.icon size={15} />
                  </span>
                );
                if (!file.mimeType.startsWith("image/")) return icon;
                return (
                  <AttachmentThumb taskId={taskId} attachmentId={file.id} fallback={icon} />
                );
              })()}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-heading">
                  {file.fileName}
                </span>
                <span className="block truncate text-[0.6875rem] text-muted">
                  {formatSize(file.size)} · {file.uploadedBy}
                </span>
              </span>

              <IconButton
                icon={downloading === file.id ? Loader2 : Download}
                spinning={downloading === file.id}
                disabled={downloading === file.id}
                label={
                  downloading === file.id
                    ? `Downloading ${file.fileName}…`
                    : `Download ${file.fileName}`
                }
                onClick={() => void download(file.id, file.fileName)}
              />
              <IconButton
                icon={removing.includes(file.id) ? Loader2 : Trash2}
                spinning={removing.includes(file.id)}
                disabled={removing.includes(file.id)}
                label={
                  removing.includes(file.id)
                    ? `Removing ${file.fileName}…`
                    : `Remove ${file.fileName}`
                }
                tone="red"
                onClick={() => setPendingDelete(file)}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void confirmDelete(pendingDelete);
        }}
        title="Remove this file?"
        message={
          pendingDelete
            ? `${pendingDelete.fileName} will be removed from this task for everyone, and the stored copy is deleted. This can't be undone.`
            : ""
        }
        confirmLabel="Remove file"
      />
    </div>
  );
}

/**
 * The "attach" affordance for the board card and the list row.
 *
 * A count and a paperclip, not an upload control: uploading needs a drop zone,
 * a progress line and somewhere to put an error, and none of that belongs in a
 * table cell. Pressing it opens the drawer at the attachments block, which is
 * where all of that already lives.
 */
export function AttachmentButton({
  taskId,
  onOpen,
}: {
  taskId: string;
  onOpen: () => void;
}) {
  const signedIn = useSession().status === "user";
  const { data: attachments = [] } = useListTaskAttachmentsQuery({ taskId }, { skip: !signedIn });

  if (!signedIn) return null;

  // Sized h-9/min-w-9 rather than by tight padding: this is the one control in
  // a list row reached by thumb as often as by cursor, and the text-sized hit
  // area it started with was a miss on a phone.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        attachments.length === 0
          ? "Attach a file"
          : `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
      }
      aria-label={
        attachments.length === 0
          ? "Attach a file"
          : `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}. Open the task.`
      }
      className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-sm text-[0.6875rem] text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Paperclip size={12} />
      {attachments.length > 0 && attachments.length}
    </button>
  );
}

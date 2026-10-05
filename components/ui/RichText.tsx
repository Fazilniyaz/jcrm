"use client";


/*
 * Rich text: the READER.
 *
 * Deliberately a separate file from RichTextEditor.tsx, and with no import of
 * `@tiptap/*` anywhere in it. Every list, table cell and detail panel in the
 * product renders stored descriptions through here; only two forms ever edit
 * one. While the two lived together, importing `RichTextView` to show a task
 * description pulled ~390 KB of editor into the chunk — the reader needs none
 * of it, and `dangerouslySetInnerHTML` is the whole of the rendering.
 *
 * Descriptions used to be a textarea, which meant a deployment plan and a
 * one-line note looked identical — no headings, no lists, no emphasis, so the
 * structure of the work lived in the writer's head and nowhere on the screen.
 *
 * SECURITY: what this produces is HTML, and `RichTextView` renders it with
 * `dangerouslySetInnerHTML` — there is no way to show formatting without doing
 * so. The gate is on the SERVER: every rich-text field is run through
 * `sanitizeRichText` before it is stored (jadvix-backend/src/lib/richText.ts),
 * so the database cannot hold a payload and no read path can resurrect one.
 * The toolbar below is deliberately limited to what that allowlist accepts, so
 * nothing a person can write here is silently thrown away on save.
 */

/* ------------------------------------------------------------------ read -- */

/** Tailwind's typography plugin is not installed, so the reading styles are here. */
/** Shared with the editor, which renders into the same prose styles. */
export const PROSE = [
  "text-[0.8125rem] leading-relaxed text-text",
  "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-[1rem] [&_h1]:font-semibold [&_h1]:text-heading",
  "[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-[0.9375rem] [&_h2]:font-semibold [&_h2]:text-heading",
  "[&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-[0.875rem] [&_h3]:font-semibold [&_h3]:text-heading",
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_strong]:font-semibold [&_strong]:text-heading",
  "[&_u]:underline [&_s]:line-through",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted",
  "[&_code]:rounded-sm [&_code]:bg-hover [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.75rem]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-hover [&_pre]:p-2.5",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
].join(" ");

/** The five entities `sanitize-html` produces when escaping text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Ampersand last: doing it first would turn "&amp;lt;" into "<".
    .replace(/&amp;/g, "&");
}

/** True when the value carries words rather than just empty markup. */
export function hasRichText(html?: string | null): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

/**
 * Render stored rich text.
 *
 * Falls back to rendering the value as plain text when it carries no markup at
 * all, so descriptions written before this existed — and anything typed into
 * the local demo store, which never passes through the server's sanitiser —
 * still read correctly instead of showing their angle brackets.
 */
export function RichTextView({
  html,
  className = "",
}: {
  html?: string | null;
  className?: string;
}) {
  if (!hasRichText(html)) return null;
  const value = html as string;

  // No tags: it is plain text, and putting it through innerHTML would be both
  // pointless and the one route by which unsanitised local content could
  // matter. Rendered as text, with newlines kept.
  //
  // Entities are decoded first. The server's sanitiser escapes bare angle
  // brackets in plain prose, so a subtask note reading "a < b" comes back as
  // "a &lt; b" — which has no tags, takes this branch, and would otherwise be
  // shown to the reader with the entity spelled out.
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return <p className={`${PROSE} whitespace-pre-wrap ${className}`}>{decodeEntities(value)}</p>;
  }

  return (
    <div
      className={`${PROSE} ${className}`}
      // Safe because the server sanitises every rich-text field on write; see
      // the note at the top of this file.
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}

/** Rich text collapsed to one line — table cells, tooltips, list subtitles. */
export function richTextToPlain(html?: string | null): string {
  if (!html) return "";
  const text = html
    .replace(/<\/(p|h[1-3]|li|blockquote|pre|div)>/gi, "$& ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Entities decoded through the shared helper, which unescapes `&amp;` LAST —
  // doing it first turns a literal "&amp;lt;" into "<".
  return decodeEntities(text);
}

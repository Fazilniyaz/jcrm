"use client";

/*
 * The rich-text editor, fetched only when a form that uses one is opened.
 *
 * TipTap and ProseMirror are ~390 KB of the client bundle and exactly two
 * screens edit rich text — the task form and the project form, both of which
 * are modals. Importing the editor statically meant every visit to Tasks or
 * Projects paid for an editor that most visits never open.
 *
 * `ssr: false` because the editor is a DOM-bound controlled component: there
 * is nothing useful to render on the server, and ProseMirror touching
 * `document` during SSR is an error rather than a slow path.
 */

import dynamic from "next/dynamic";
import { Field } from "@/components/ui/form";

/**
 * The placeholder is sized like the real thing.
 *
 * A spinner, or nothing, would collapse the form and shift every field below
 * it the moment the chunk lands. Reserving the same box means the swap is
 * invisible.
 */
function EditorSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <Field label={label}>
      <div
        className="animate-pulse rounded-sm border border-line bg-subtle"
        style={{ height: `${Math.max(2, rows) * 1.5 + 3.25}rem` }}
      />
    </Field>
  );
}

export const RichTextEditor = dynamic(
  () => import("./RichTextEditor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <EditorSkeleton label="Description" />,
  },
);

export default RichTextEditor;

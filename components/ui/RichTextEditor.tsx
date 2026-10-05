"use client";

/*
 * Rich text: the EDITOR.
 *
 * Split out of RichText.tsx so that the reader — which the whole product uses
 * — carries no `@tiptap/*` import. See the note at the top of that file.
 *
 * SECURITY: what this produces is HTML. The gate is on the SERVER: every
 * rich-text field is run through `sanitizeRichText` before it is stored
 * (jcrmbe/src/lib/richText.ts), so the database cannot hold a payload and no
 * read path can resurrect one. The toolbar below is deliberately limited to
 * what that allowlist accepts, so nothing a person can write here is silently
 * thrown away on save.
 */

import { useEffect, useId } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Field } from "@/components/ui/form";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import type { IconType } from "@/lib/ui/icon";
import { PROSE } from "./RichText";

/** Matches the server's allowlist. Anything outside it would be stripped on save. */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      // Clicking a link inside the EDITOR should place the cursor, not navigate
      // away from a half-written description.
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https", "mailto"],
    },
    // The server drops these, so offering them would be a lie.
    horizontalRule: false,
  }),
];


function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: IconType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // The editor loses its selection when a button takes focus, and a
      // formatting command with no selection formats nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-white" : "text-muted hover:bg-hover hover:text-primary"
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />;
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const current = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link address", current ?? "https://");
    // Cancelled: leave the document exactly as it was.
    if (input === null) return;

    const href = input.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // Only the schemes the server keeps. Anything else would be stripped on
    // save, so accepting it here would lose the link without saying so.
    if (!/^(https?:|mailto:)/i.test(href)) {
      window.alert("Links must start with http://, https:// or mailto:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-input-border bg-form-bg px-1.5 py-1">
      <ToolbarButton
        icon={Bold}
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={UnderlineIcon}
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <Divider />

      <ToolbarButton
        icon={Heading1}
        label="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={Heading2}
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={Heading3}
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Divider />

      <ToolbarButton
        icon={List}
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={Quote}
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={Code}
        label="Code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <Divider />

      <ToolbarButton
        icon={Link2}
        label="Add or edit link"
        active={editor.isActive("link")}
        onClick={setLink}
      />
      <ToolbarButton
        icon={Link2Off}
        label="Remove link"
        disabled={!editor.isActive("link")}
        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
      />

      <Divider />

      <ToolbarButton
        icon={Undo2}
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        icon={Redo2}
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}

/**
 * A rich-text field, shaped like the plain `Field` components around it.
 *
 * `value` is HTML. It is pushed into the editor only when it differs from what
 * the editor already holds — writing it back on every render would reset the
 * cursor to the top of the document on every keystroke.
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required = false,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Roughly how many lines tall before it scrolls. */
  rows?: number;
}) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value || "",
    // Required in the app router: rendering the editor during SSR produces
    // markup the client immediately replaces, which React reports as a
    // hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${PROSE} min-h-[var(--rt-min)] w-full px-2.5 py-2 outline-none`,
        style: `--rt-min:${rows * 1.5}rem`,
      },
    },
    onUpdate({ editor: instance }) {
      // An empty document is `<p></p>`, which is not an empty string. Reporting
      // it as one keeps "is there a description" answerable by the caller
      // without it having to know what the editor emits.
      onChange(instance.isEmpty ? "" : instance.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value === current) return;
    // `emitUpdate: false` so resetting the field from outside (opening the form
    // on a different record) does not fire onChange straight back at the caller.
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  const id = useId();

  // Wrapped in the same `Field` as every other control, so the label, the
  // required marker, the hint and the error all sit exactly where they do on a
  // text input rather than being re-invented a pixel out.
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <div
        className={`overflow-hidden rounded-sm border bg-form-bg transition-colors focus-within:border-primary ${
          error ? "border-danger" : "border-input-border"
        }`}
        style={error ? { borderColor: "rgb(var(--danger-rgb))" } : undefined}
      >
        {editor && <Toolbar editor={editor} />}
        <div className="relative max-h-80 overflow-y-auto">
          {editor?.isEmpty && placeholder && (
            <p
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-2 text-[0.8125rem] text-muted"
            >
              {placeholder}
            </p>
          )}
          <EditorContent editor={editor} id={id} aria-invalid={error ? true : undefined} />
        </div>
      </div>
    </Field>
  );
}

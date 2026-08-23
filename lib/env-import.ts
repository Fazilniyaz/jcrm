/*
 * Reading a .env file the way a person actually holds one.
 *
 * The vault stores key/value pairs, and until now the only way in was typing
 * them one row at a time. Nobody holds credentials that way — they hold a
 * `.env`, or a block of text pasted out of one, and retyping thirty values into
 * thirty pairs of inputs is how a character gets dropped from a secret and an
 * afternoon gets spent finding out which one.
 *
 * This parses the real shapes that turn up in that text, and reports what it
 * could not read rather than quietly dropping it. A parser that silently skips
 * a malformed line is worse than no parser: the value is missing from the vault
 * and nothing says so.
 */

/** What the backend accepts as a key. Anything else is reported, not stored. */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Longest value the vault will store, mirroring the API's own cap.
 *
 * Checked here so one oversized value is reported as one skipped line, rather
 * than being accepted into the editor and then failing the entire save with a
 * validation error that names no line.
 */
const MAX_VALUE_LENGTH = 8000;

export type ParsedEnvEntry = { key: string; value: string };

export type ParsedEnv = {
  entries: ParsedEnvEntry[];
  /** Lines that looked like they meant something but could not be read. */
  skipped: { line: number; text: string; reason: string }[];
};

/**
 * Unescape a double-quoted value.
 *
 * Only inside double quotes, matching shell and dotenv: `\n` in a single-quoted
 * value is a backslash followed by an n, and a private key pasted between
 * single quotes must survive with its backslashes intact.
 */
function unescapeDouble(raw: string): string {
  return raw.replace(/\\([nrt"'\\$`])/g, (_match, char: string) => {
    if (char === "n") return "\n";
    if (char === "r") return "\r";
    if (char === "t") return "\t";
    return char;
  });
}

/**
 * Strip an unquoted value's trailing comment.
 *
 * ` # comment` ends the value; `#` with no space before it does not, because
 * plenty of real values (URLs with fragments, colour codes) contain one.
 */
function stripInlineComment(raw: string): string {
  const at = raw.search(/\s#/);
  return at === -1 ? raw : raw.slice(0, at);
}

/**
 * Parse .env text into key/value pairs.
 *
 * Handles: blank lines, `#` comments, an `export ` prefix, `KEY=`, values in
 * single or double quotes, quoted values that run across several lines (a PEM
 * key pasted whole), inline comments after unquoted values, and `KEY: value`
 * as well as `KEY=value` because that is what a pasted YAML-ish block looks
 * like. A later definition of the same key wins, as it would if the file were
 * loaded.
 */
export function parseEnv(text: string): ParsedEnv {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const found = new Map<string, string>();
  const skipped: ParsedEnv["skipped"] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.replace(/^export\s+/, "");

    /*
     * Try each separator, and keep the one that yields a usable KEY.
     *
     * Order alone is not enough. `DATABASE_URL,mongodb+srv://user:pass@host`
     * is a CSV row, but it contains a colon inside the value, so splitting on
     * the first `:` produces the key `DATABASE_URL,mongodb+srv` — which is not
     * a name anything could use. Choosing by "did this give me a valid key"
     * rather than "did this match" reads that line correctly and still reads
     * `PORT=4000, and check the docs` as PORT, because `=` is tried first and
     * its key is already valid.
     */
    const candidates = [
      withoutExport.match(/^([^=]+)=([\s\S]*)$/),
      withoutExport.match(/^([^:]+):([\s\S]*)$/),
      withoutExport.match(/^([^,]+),([\s\S]*)$/),
    ].filter((m): m is RegExpMatchArray => m !== null);

    if (candidates.length === 0) {
      skipped.push({ line: i + 1, text: trimmed, reason: "No =, : or , on this line." });
      continue;
    }

    const split = candidates.find((m) => KEY_PATTERN.test(m[1].trim()));
    if (!split) {
      // Something separator-shaped, but nothing on the left that could be a
      // name. Reported against the first reading, which is the one a person
      // would have meant.
      const attempted = candidates[0][1].trim();
      skipped.push({
        line: i + 1,
        text: trimmed,
        reason: `"${attempted}" isn't a usable name — letters, digits and _ only, not starting with a digit.`,
      });
      continue;
    }

    const key = split[1].trim();

    // A CSV's header row is not a credential. Dropped silently rather than
    // reported, because it is expected, and warning about it would teach
    // people to ignore the warnings that matter.
    if (/^(key|name|variable|setting)$/i.test(key) && /^(value|val)$/i.test(split[2].trim())) {
      continue;
    }

    let rest = split[2].trim();
    let value: string;

    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      // Consume following lines until the quote closes, so a multi-line value
      // pasted straight out of a file arrives whole rather than as its first
      // line plus a pile of unreadable ones.
      let body = rest.slice(1);
      let closed = false;
      for (;;) {
        // A closing quote not itself escaped.
        const end = body.search(new RegExp(`(?<!\\\\)${quote}`));
        if (end !== -1) {
          body = body.slice(0, end);
          closed = true;
          break;
        }
        if (i + 1 >= lines.length) break;
        i += 1;
        body += `\n${lines[i]}`;
      }
      if (!closed) {
        skipped.push({ line: i + 1, text: trimmed, reason: "Quote is never closed." });
        continue;
      }
      value = quote === '"' ? unescapeDouble(body) : body;
    } else {
      rest = stripInlineComment(rest).trim();
      value = rest;
    }

    if (value.length > MAX_VALUE_LENGTH) {
      skipped.push({
        line: i + 1,
        text: trimmed,
        reason: `${key} is ${value.length} characters — the vault stores up to ${MAX_VALUE_LENGTH}.`,
      });
      continue;
    }

    found.set(key, value);
  }

  return { entries: [...found].map(([key, value]) => ({ key, value })), skipped };
}

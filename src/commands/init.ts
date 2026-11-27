import path from "node:path";
import type { Deps } from "../deps.ts";
import { claudeSettingsPath, stateDir } from "../paths.ts";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Double-quote a path; backslashes become slashes (Git Bash and cmd both accept them, and Git Bash would eat backslashes). */
export function shellQuote(p: string): string {
  return `"${p.replace(/\\/g, "/")}"`;
}

/** POSIX single-quote: nothing inside is expanded by the shell. */
export function posixQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Inverse of posixQuote; null when the text is not exactly one such quoted word. */
export function posixUnquote(s: string): string | null {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) return null;
      out += s.slice(i + 1, end);
      i = end + 1;
    } else if (s.startsWith("\\'", i)) {
      out += "'";
      i += 2;
    } else {
      return null;
    }
  }
  return out;
}

export const HOOK_EVENTS = ["UserPromptSubmit", "SessionStart"] as const;

const binDir = (d: Deps) => path.join(stateDir(d), "bin");
const binFile = (d: Deps) => path.join(binDir(d), "cli.mjs");

const OURS_MARK = ".claude-tab-label/bin/cli.";
const OURS_STATUSLINE = /^node "[^"]*\.claude-tab-label\/bin\/cli\.m?js" statusline(?= |$)/;
const commandOf = (v: unknown): string | null => (isObject(v) && typeof v.command === "string" ? v.command : null);
const isOursStatusLine = (v: unknown): boolean => OURS_STATUSLINE.test(commandOf(v) ?? "");
/** Our status line wrapped inside someone else's (for example claude-gh-guard installed after us). */
const isNestedStatusLine = (v: unknown): boolean => !isOursStatusLine(v) && (commandOf(v) ?? "").includes(OURS_MARK);
const entryHooks = (e: unknown): unknown[] => (isObject(e) && Array.isArray(e.hooks) ? e.hooks : []);
const isOursHook = (h: unknown): boolean => (commandOf(h) ?? "").includes(OURS_MARK);
const isOursEntry = (e: unknown): boolean => entryHooks(e).some(isOursHook);

function timestamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function loadSettings(file: string, d: Deps): { json: Json; text: string | null } | string {
  const text = d.readFile(file);
  if (text === null) return { json: {}, text: null };
  try {
    const v: unknown = JSON.parse(text);
    if (!isObject(v)) return `error: ${file} is not a JSON object; left unchanged`;
    return { json: v, text };
  } catch (e) {
    return `error: ${file} is not valid JSON (${e instanceof Error ? e.message : String(e)}); left unchanged`;
  }
}

const serialize = (j: Json) => JSON.stringify(j, null, 2) + "\n";

function backupAndWrite(file: string, text: string | null, out: string, d: Deps, verb: string): string[] {
  if (out === text) return [`unchanged: ${file}`];
  const lines: string[] = [];
  if (text !== null) {
    let bak = `${file}.bak-${timestamp(d.now())}`;
    for (let n = 1; d.mtime(bak) !== null; n++) bak = `${file}.bak-${timestamp(d.now())}-${n}`;
    d.writeFile(bak, text);
    lines.push(`backup: ${bak}`);
  }
  d.writeFile(file, out);
  lines.push(`${verb}: ${file}`);
  return lines;
}

/** Drop our hook objects from a hook event's entries; entries left empty are removed. Returns where our first whole entry stood. */
function stripOurs(entries: unknown[]): { kept: unknown[]; at: number } {
  const kept: unknown[] = [];
  let at = -1;
  for (const e of entries) {
    if (!isOursEntry(e)) {
      kept.push(e);
      continue;
    }
    const rest = entryHooks(e).filter((h) => !isOursHook(h));
    if (rest.length > 0) kept.push({ ...(e as Json), hooks: rest });
    else if (at < 0) at = kept.length;
  }
  return { kept, at };
}

export function runInit(d: Deps, selfPath: string, opts: { settings?: string } = {}): string {
  const file = opts.settings ?? claudeSettingsPath(d);
  const loaded = loadSettings(file, d);
  if (typeof loaded === "string") return loaded;
  const { json, text } = loaded;

  const code = d.readFile(selfPath);
  if (code === null) return `error: cannot read ${selfPath} to install it`;
  d.writeFile(binFile(d), code);
  const base = `node ${shellQuote(binFile(d))}`;

  // status line: ours goes first, any existing one keeps running underneath it
  const cur = json.statusLine;
  if (isOursStatusLine(cur)) {
    const o = cur as Json;
    o.command = (o.command as string).replace(OURS_STATUSLINE, `${base} statusline`);
  } else if (isNestedStatusLine(cur)) {
    // already running inside another tool's status line; the copied bin above keeps it current
  } else if (commandOf(cur) !== null) {
    json.statusLine = { ...(cur as Json), command: `${base} statusline --after ${posixQuote(commandOf(cur)!)}` };
  } else {
    json.statusLine = { type: "command", command: `${base} statusline` };
  }

  // hooks
  const hooks: Json = isObject(json.hooks) ? json.hooks : {};
  for (const event of HOOK_EVENTS) {
    const { kept, at } = stripOurs(Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : []);
    kept.splice(at >= 0 ? at : kept.length, 0, { hooks: [{ type: "command", command: `${base} hook` }] });
    hooks[event] = kept;
  }
  json.hooks = hooks;

  const lines = backupAndWrite(file, text, serialize(json), d, "updated");
  lines.push(`installed: ${binFile(d)}`, `statusLine and ${HOOK_EVENTS.join(" + ")} hooks registered`);
  return lines.join("\n");
}

/**
 * Parse the arguments after our `statusline` prefix: optionally `--after` followed by exactly one
 * POSIX single-quoted word. Returns the wrapped command (null if none), or undefined when the text
 * is anything else.
 */
export function recoverOriginal(rest: string): string | null | undefined {
  const t = rest.trim();
  if (t === "") return null;
  const m = /^--after\s+(.+)$/s.exec(t);
  if (!m) return undefined;
  return posixUnquote(m[1]!.trim()) ?? undefined;
}

export function runUninstall(d: Deps, opts: { settings?: string } = {}): string {
  const file = opts.settings ?? claudeSettingsPath(d);
  const loaded = loadSettings(file, d);
  if (typeof loaded === "string") return loaded;
  const { json, text } = loaded;

  if (text === null) {
    d.remove(binDir(d));
    return `no settings file at ${file}; removed installed files`;
  }

  if (isObject(json.hooks)) {
    const hooks = json.hooks;
    for (const event of HOOK_EVENTS) {
      if (!Array.isArray(hooks[event])) continue;
      const { kept } = stripOurs(hooks[event] as unknown[]);
      if (kept.length > 0) hooks[event] = kept;
      else delete hooks[event];
    }
    if (Object.keys(hooks).length === 0) delete json.hooks;
  }

  let keepBin: string | null = null;
  const sl = json.statusLine;
  if (isOursStatusLine(sl)) {
    const orig = recoverOriginal(commandOf(sl)!.replace(OURS_STATUSLINE, ""));
    if (orig === null) delete json.statusLine;
    else if (orig !== undefined) json.statusLine = { ...(sl as Json), command: orig };
    else keepBin = "could not recover the original statusLine command; left it in place";
  } else if (isNestedStatusLine(sl)) {
    keepBin = "the statusLine runs claude-tab-label inside another tool's status line; left it in place";
  }

  const lines = backupAndWrite(file, text, serialize(json), d, "restored");
  if (keepBin) {
    // the status line still runs our installed copy: deleting it would break the user's status line
    lines.push(keepBin, `kept: ${binDir(d)} (the statusLine above still uses it; edit statusLine, then delete this folder)`);
  } else {
    d.remove(binDir(d));
    lines.push(`removed: ${binDir(d)}`);
  }
  return lines.join("\n");
}

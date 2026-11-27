import path from "node:path";
import type { Deps } from "./deps.ts";
import { sessionsDir } from "./paths.ts";

export interface SessionState {
  label: string;
}

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Session ids come from Claude Code; refuse anything that could escape the sessions folder. */
export const validSessionId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);

const file = (d: Deps, id: string) => path.join(sessionsDir(d), `${id}.json`);

export function loadState(d: Deps, id: string): SessionState | null {
  if (!validSessionId(id)) return null;
  try {
    const v = JSON.parse(d.readFile(file(d, id)) ?? "");
    return v && typeof v.label === "string" ? { label: v.label } : null;
  } catch {
    return null;
  }
}

export function saveState(d: Deps, id: string, s: SessionState): void {
  if (!validSessionId(id)) return;
  d.writeFile(file(d, id), JSON.stringify(s));
}

/** Forget sessions untouched for two weeks so the folder does not grow forever. */
export function pruneStates(d: Deps): void {
  const dir = sessionsDir(d);
  const cutoff = d.now() - MAX_AGE_MS;
  for (const name of d.listDir(dir)) {
    if (!name.endsWith(".json")) continue;
    const p = path.join(dir, name);
    const m = d.mtime(p);
    if (m !== null && m < cutoff) d.remove(p);
  }
}

import path from "node:path";
import type { Deps } from "../src/deps.ts";

export type FakeDeps = Deps & { files: Map<string, string>; mtimes: Map<string, number> };

export function fakeDeps(overrides: Partial<Deps> & { files?: Record<string, string> } = {}): FakeDeps {
  const { files: initial, ...rest } = overrides;
  const files = new Map<string, string>();
  const mtimes = new Map<string, number>();
  for (const [k, v] of Object.entries(initial ?? {})) files.set(path.normalize(k), v);
  let clock = 1_000_000_000_000;
  const base: Deps = {
    env: {},
    platform: "linux",
    home: "/home/test",
    now: () => clock,
    readFile: (p) => files.get(path.normalize(p)) ?? null,
    writeFile: (p, s) => {
      files.set(path.normalize(p), s);
      mtimes.set(path.normalize(p), clock);
    },
    mtime: (p) => (files.has(path.normalize(p)) ? (mtimes.get(path.normalize(p)) ?? clock) : null),
    listDir: (p) => {
      const n = path.normalize(p) + path.sep;
      return [...files.keys()].filter((k) => k.startsWith(n) && !k.slice(n.length).includes(path.sep)).map((k) => k.slice(n.length));
    },
    remove: (p) => {
      const n = path.normalize(p);
      for (const k of [...files.keys()]) if (k === n || k.startsWith(n + path.sep)) files.delete(k);
    },
    exec: () => ({ code: 1, stdout: "", stderr: "" }),
  };
  return Object.assign({ ...base, ...rest }, { files, mtimes });
}

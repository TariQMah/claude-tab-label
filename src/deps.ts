import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface Deps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  home: string;
  now(): number;
  readFile(p: string): string | null;
  writeFile(p: string, s: string): void;
  mtime(p: string): number | null;
  /** Names of the entries in a directory; empty when it is missing. */
  listDir(p: string): string[];
  /** Remove a file or directory tree; missing paths are ignored. */
  remove(p: string): void;
  exec(
    cmd: string,
    args: string[],
    opts?: { timeoutMs?: number; input?: string; verbatim?: boolean },
  ): { code: number | null; stdout: string; stderr: string };
}

export function realDeps(): Deps {
  return {
    env: process.env,
    platform: process.platform,
    home: os.homedir(),
    now: () => Date.now(),
    readFile(p) {
      try {
        return fs.readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
    writeFile(p, s) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, s);
    },
    mtime(p) {
      try {
        return fs.statSync(p).mtimeMs;
      } catch {
        return null;
      }
    },
    listDir(p) {
      try {
        return fs.readdirSync(p);
      } catch {
        return [];
      }
    },
    remove(p) {
      fs.rmSync(p, { recursive: true, force: true });
    },
    exec(cmd, args, opts = {}) {
      const r = spawnSync(cmd, args, {
        timeout: opts.timeoutMs,
        input: opts.input,
        encoding: "utf8",
        windowsHide: true,
        windowsVerbatimArguments: opts.verbatim,
      });
      return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
  };
}

import fs from "node:fs";
import path from "node:path";
import { realDeps } from "./deps.ts";
import { runStatusline } from "./commands/statusline.ts";
import { runHook } from "./commands/hook.ts";
import { runInit, runUninstall } from "./commands/init.ts";
import { claudeSettingsPath } from "./paths.ts";

function readStdin(): string {
  if (process.stdin.isTTY) return "";
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function main(argv: string[]): number {
  try {
    const d = realDeps();
    const [cmd, ...rest] = argv;
    switch (cmd) {
      case "statusline":
        process.stdout.write(runStatusline(readStdin(), rest, d) + "\n");
        return 0;
      case "hook":
        process.stdout.write(runHook(readStdin(), d));
        return 0;
      case "init":
      case "uninstall": {
        const i = rest.indexOf("--settings");
        const given = i >= 0 ? rest[i + 1] : undefined;
        if (i >= 0 && !given) {
          process.stderr.write("claude-tab-label: --settings needs a path\n");
          return 1;
        }
        const settings = given ? path.resolve(given) : claudeSettingsPath(d);
        const self = path.resolve(process.argv[1] ?? "");
        const msg = cmd === "init" ? runInit(d, self, { settings }) : runUninstall(d, { settings });
        const failed = msg.startsWith("error:");
        (failed ? process.stderr : process.stdout).write(msg + "\n");
        if (!failed && cmd === "init") process.stdout.write("Restart Claude Code to load the status line and hooks.\n");
        return failed ? 1 : 0;
      }
      default:
        process.stderr.write("usage: claude-tab-label <init|uninstall|statusline|hook>\n");
        return 0;
    }
  } catch {
    // a status line or hook must never break Claude Code
    return 0;
  }
}

if (/^(cli\.(m?js|ts)|claude-tab-label)$/.test(path.basename(process.argv[1] ?? ""))) {
  process.exitCode = main(process.argv.slice(2));
}

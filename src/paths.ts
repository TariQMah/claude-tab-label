import path from "node:path";
import type { Deps } from "./deps.ts";

export function stateDir(d: Deps): string {
  return path.join(d.home, ".claude-tab-label");
}

export function sessionsDir(d: Deps): string {
  return path.join(stateDir(d), "sessions");
}

/** Claude Code's settings.json: $CLAUDE_CONFIG_DIR when set, else ~/.claude. */
export function claudeSettingsPath(d: Deps): string {
  if (d.env.CLAUDE_CONFIG_DIR) return path.join(d.env.CLAUDE_CONFIG_DIR, "settings.json");
  return path.join(d.home, ".claude", "settings.json");
}

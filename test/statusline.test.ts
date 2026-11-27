import { test } from "node:test";
import assert from "node:assert/strict";
import { runStatusline } from "../src/commands/statusline.ts";
import { badge } from "../src/label.ts";
import { saveState } from "../src/state.ts";
import { fakeDeps } from "./helpers.ts";

const noColor = { NO_COLOR: "1" };

test("shows badge, session name and latest label", () => {
  const d = fakeDeps({ env: noColor });
  saveState(d, "s1", { label: "fix refund rounding" });
  const out = runStatusline(JSON.stringify({ session_id: "s1", session_name: "payments" }), [], d);
  assert.equal(out, `${badge("s1").emoji} payments · "fix refund rounding"`);
});

test("shows just the badge before the first prompt", () => {
  const out = runStatusline(JSON.stringify({ session_id: "s1" }), [], fakeDeps({ env: noColor }));
  assert.equal(out, badge("s1").emoji);
});

test("colours use the session's badge colour", () => {
  const d = fakeDeps();
  saveState(d, "s1", { label: "task" });
  const out = runStatusline(JSON.stringify({ session_id: "s1" }), [], d);
  assert.ok(out.includes(`38;5;${badge("s1").ansi}m`));
});

test("a wrapped status line runs with the same stdin and goes underneath", () => {
  const stdin = JSON.stringify({ session_id: "s1", session_name: "x" });
  let seen: { cmd: string; args: string[]; input?: string } | null = null;
  const d = fakeDeps({
    env: noColor,
    exec: (cmd, args, opts) => {
      seen = { cmd, args, input: opts?.input };
      return { code: 0, stdout: "gh:me · claude:me\n", stderr: "" };
    },
  });
  const out = runStatusline(stdin, ["--after", "my-statusline --flag"], d);
  assert.equal(out, `${badge("s1").emoji} x\ngh:me · claude:me`);
  assert.deepEqual(seen, { cmd: "/bin/sh", args: ["-c", "my-statusline --flag"], input: stdin });
});

test("a failing wrapped status line still leaves ours", () => {
  const d = fakeDeps({ env: noColor, exec: () => ({ code: null, stdout: "", stderr: "" }) });
  assert.equal(runStatusline(JSON.stringify({ session_id: "s1" }), ["--after", "x"], d), badge("s1").emoji);
});

test("on Windows the wrapped command runs through Git Bash", () => {
  let cmd = "";
  const d = fakeDeps({
    env: { ...noColor, ProgramFiles: "C:\\Program Files" },
    platform: "win32",
    files: { "C:\\Program Files\\Git\\bin\\bash.exe": "" },
    exec: (c) => {
      cmd = c;
      return { code: 0, stdout: "theirs", stderr: "" };
    },
  });
  runStatusline("{}", ["--after", "x"], d);
  assert.equal(cmd, "C:\\Program Files\\Git\\bin\\bash.exe");
});

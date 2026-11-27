import { test } from "node:test";
import assert from "node:assert/strict";
import { runInit, runUninstall, recoverOriginal, posixQuote } from "../src/commands/init.ts";
import { fakeDeps } from "./helpers.ts";

const SETTINGS = "/home/test/.claude/settings.json";
const SELF = "/pkg/dist/cli.js";
const BASE = 'node "/home/test/.claude-tab-label/bin/cli.mjs"';
const read = (d: ReturnType<typeof fakeDeps>) => JSON.parse(d.readFile(SETTINGS)!);

test("fresh install sets our status line and both hooks", () => {
  const d = fakeDeps({ files: { [SELF]: "code" } });
  runInit(d, SELF);
  const s = read(d);
  assert.deepEqual(s.statusLine, { type: "command", command: `${BASE} statusline` });
  for (const ev of ["UserPromptSubmit", "SessionStart"]) {
    assert.deepEqual(s.hooks[ev], [{ hooks: [{ type: "command", command: `${BASE} hook` }] }]);
  }
  assert.equal(d.readFile("/home/test/.claude-tab-label/bin/cli.mjs"), "code");
});

test("an existing status line is wrapped and existing hooks are kept", () => {
  const orig = "node \"/x/gh-guard.mjs\" statusline --after 'bash ~/s.sh'";
  const other = { hooks: [{ type: "command", command: "echo hi" }] };
  const d = fakeDeps({
    files: {
      [SELF]: "code",
      [SETTINGS]: JSON.stringify({ statusLine: { type: "command", command: orig, padding: 0 }, hooks: { UserPromptSubmit: [other] } }),
    },
  });
  const msg = runInit(d, SELF);
  assert.match(msg, /backup: .*settings\.json\.bak-/);
  const s = read(d);
  assert.deepEqual(s.statusLine, { type: "command", command: `${BASE} statusline --after ${posixQuote(orig)}`, padding: 0 });
  assert.equal(s.hooks.UserPromptSubmit.length, 2);
  assert.deepEqual(s.hooks.UserPromptSubmit[0], other);
});

test("init is idempotent", () => {
  const d = fakeDeps({ files: { [SELF]: "code", [SETTINGS]: JSON.stringify({ statusLine: { type: "command", command: "x" } }) } });
  runInit(d, SELF);
  const once = d.readFile(SETTINGS);
  assert.match(runInit(d, SELF), /unchanged/);
  assert.equal(d.readFile(SETTINGS), once);
});

test("when another tool already wraps us, the status line is left alone", () => {
  const nested = `node "/x/gh-guard.mjs" statusline --after '${BASE} statusline'`;
  const d = fakeDeps({ files: { [SELF]: "code", [SETTINGS]: JSON.stringify({ statusLine: { type: "command", command: nested } }) } });
  runInit(d, SELF);
  assert.equal(read(d).statusLine.command, nested);
});

test("uninstall restores the original status line and removes our hooks", () => {
  const other = { hooks: [{ type: "command", command: "echo hi" }] };
  const d = fakeDeps({
    files: { [SELF]: "code", [SETTINGS]: JSON.stringify({ statusLine: { type: "command", command: "my 'quoted' line" }, hooks: { UserPromptSubmit: [other] } }) },
  });
  runInit(d, SELF);
  const msg = runUninstall(d);
  const s = read(d);
  assert.equal(s.statusLine.command, "my 'quoted' line");
  assert.deepEqual(s.hooks, { UserPromptSubmit: [other] });
  assert.match(msg, /removed: /);
  assert.equal(d.readFile("/home/test/.claude-tab-label/bin/cli.mjs"), null);
});

test("uninstall of a fresh install removes everything we added", () => {
  const d = fakeDeps({ files: { [SELF]: "code", [SETTINGS]: "{}" } });
  runInit(d, SELF);
  runUninstall(d);
  assert.deepEqual(read(d), {});
});

test("uninstall keeps the bin when another tool wraps us", () => {
  const nested = `node "/x/gh-guard.mjs" statusline --after '${BASE} statusline'`;
  const d = fakeDeps({ files: { [SELF]: "code", [SETTINGS]: JSON.stringify({ statusLine: { type: "command", command: nested } }) } });
  runInit(d, SELF);
  const msg = runUninstall(d);
  assert.match(msg, /kept: /);
  assert.equal(read(d).statusLine.command, nested);
  assert.equal(d.readFile("/home/test/.claude-tab-label/bin/cli.mjs"), "code");
});

test("invalid settings are left untouched", () => {
  const d = fakeDeps({ files: { [SELF]: "code", [SETTINGS]: "{ nope" } });
  assert.match(runInit(d, SELF), /^error: /);
  assert.equal(d.readFile(SETTINGS), "{ nope");
});

test("recoverOriginal", () => {
  assert.equal(recoverOriginal(""), null);
  assert.equal(recoverOriginal(` --after ${posixQuote("a 'b' c")}`), "a 'b' c");
  assert.equal(recoverOriginal(" --after unquoted"), undefined);
  assert.equal(recoverOriginal(" --weird"), undefined);
});

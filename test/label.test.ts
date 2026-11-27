import { test } from "node:test";
import assert from "node:assert/strict";
import { badge, clean, labelFrom, shorten } from "../src/label.ts";

test("badge is stable per session and varies across sessions", () => {
  assert.deepEqual(badge("abc"), badge("abc"));
  const seen = new Set(Array.from({ length: 50 }, (_, i) => badge(`session-${i}`).emoji));
  assert.ok(seen.size >= 5, `only ${seen.size} badges used`);
});

test("clean strips control characters and collapses whitespace", () => {
  assert.equal(clean("a\x1b]0;evil\x07b\t\n c\x9b"), "a ]0;evil b c");
});

test("shorten counts code points, not UTF-16 units", () => {
  assert.equal(shorten("🟩🟩🟩🟩", 4), "🟩🟩🟩🟩");
  assert.equal(shorten("🟩🟩🟩🟩🟩", 4), "🟩🟩🟩…");
  assert.equal(shorten("환불 금액 반올림", 5), "환불 금…");
});

test("labelFrom takes the first non-empty line", () => {
  assert.equal(labelFrom("\n\n  fix the refund rounding \nstack trace..."), "fix the refund rounding");
});

test("labelFrom skips short replies and slash commands", () => {
  assert.equal(labelFrom("ㅇㅇ"), null);
  assert.equal(labelFrom("계속해"), null);
  assert.equal(labelFrom("ok"), null);
  assert.equal(labelFrom("/rename payments"), null);
  assert.equal(labelFrom("   "), null);
});

test("labelFrom honours a custom minimum", () => {
  assert.equal(labelFrom("ok", 0), "ok");
  assert.equal(labelFrom("버그 고쳐", 5), "버그 고쳐");
  assert.equal(labelFrom("버그 고쳐", 6), null);
});

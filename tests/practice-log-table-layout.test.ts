import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coachAppSource = readFileSync(new URL("../src/components/CoachApp.tsx", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("Practice log table constrains long memos to a cell-level horizontal scroller", () => {
  assert.match(coachAppSource, /w-full min-w-\[1120px\] table-fixed/);
  assert.match(coachAppSource, /max-w-full overflow-x-auto whitespace-nowrap/);
  assert.doesNotMatch(coachAppSource, /min-w-56[^\n]*value=\{draft\.memo\}/);
});

test("Practice log edit memo stays inside its column and can wrap", () => {
  assert.match(coachAppSource, /<textarea className=\{`\$\{editInputClass\} min-h-16 resize-y whitespace-pre-wrap py-2`\}/);
});

test("Practice log actions use a fixed sticky right column", () => {
  assert.match(coachAppSource, /<col className="w-36" \/>/);
  assert.match(coachAppSource, /sticky right-0 z-10 bg-zinc-50/);
  assert.match(coachAppSource, /sticky right-0 z-\[1\] bg-white/);
});

test("enabled and disabled buttons expose appropriate cursors", () => {
  assert.match(globalCssSource, /button:not\(:disabled\)\s*\{\s*cursor: pointer;/);
  assert.match(globalCssSource, /button:disabled\s*\{\s*cursor: not-allowed;/);
});

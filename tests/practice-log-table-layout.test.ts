import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coachAppSource = readFileSync(new URL("../src/components/CoachApp.tsx", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("Practice log table constrains long memos to a cell-level horizontal scroller", () => {
  assert.match(coachAppSource, /w-full min-w-\[1180px\] table-fixed/);
  assert.match(coachAppSource, /max-w-full overflow-x-auto whitespace-nowrap/);
  assert.doesNotMatch(coachAppSource, /min-w-56[^\n]*value=\{draft\.memo\}/);
});

test("Practice log edit memo stays inside its column and can wrap", () => {
  assert.match(coachAppSource, /<textarea className=\{`\$\{editInputClass\} min-h-16 resize-y whitespace-pre-wrap py-2`\}/);
});

test("Practice log actions use a fixed sticky right column", () => {
  assert.match(coachAppSource, /<col className="w-36" \/>/);
  assert.match(coachAppSource, /sticky right-0 z-10 bg-zinc-50[^\n]*dark:bg-zinc-900/);
  assert.match(coachAppSource, /sticky right-0 z-\[1\] bg-white text-zinc-900[^\n]*dark:bg-zinc-900 dark:text-zinc-100/);
});

test("Practice memo has explicit readable light and dark text colors", () => {
  assert.match(coachAppSource, /overflow-x-auto whitespace-nowrap[^\n]*text-zinc-800 dark:text-zinc-200/);
});

test("Log tables abbreviate only the displayed International Names badge", () => {
  assert.match(coachAppSource, /<DisciplineBadge discipline=\{log\.discipline\} compact \/>/);
  assert.match(coachAppSource, /compact && discipline === "International Names" \? "Inter" : discipline/);
  assert.match(coachAppSource, /title=\{discipline\}/);
});

test("Official Mode uses three wrapping rows without overflowing its wider cell", () => {
  assert.match(coachAppSource, /<td className=\{`\$\{cellClass\} min-w-0 overflow-hidden`\}>/);
  assert.match(coachAppSource, /<col className="w-52" \/>/);
  assert.match(coachAppSource, /mode === "official"/);
  assert.match(coachAppSource, /details\.tournamentName.*whitespace-normal.*\[overflow-wrap:anywhere\]/);
  assert.match(coachAppSource, /details\.matchDetails.*whitespace-normal.*\[overflow-wrap:anywhere\]/);
  assert.match(coachAppSource, /title=\{details\.title \|\| undefined\}/);
  assert.doesNotMatch(coachAppSource, /details && <span className="[^"]*text-ellipsis/);
});

test("Train and Rated retain their compact Mode badge", () => {
  assert.match(coachAppSource, /inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border/);
  assert.match(coachAppSource, /\[getModeLabel\(mode\), \.\.\.matchDetails\]\.join\(" \/ "\)/);
});

test("Analytics self-rating cards separate light and dark colors", () => {
  assert.match(coachAppSource, /border-zinc-200 bg-white[^\n]*text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100/);
});

test("Tailwind dark variants follow the app theme class instead of the OS theme", () => {
  assert.match(globalCssSource, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);/);
});

test("enabled and disabled buttons expose appropriate cursors", () => {
  assert.match(globalCssSource, /button:not\(:disabled\)\s*\{\s*cursor: pointer;/);
  assert.match(globalCssSource, /button:disabled\s*\{\s*cursor: not-allowed;/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePracticeLogBody, parsePracticeLogSelfRatingPatch, updatePracticeLogSelfRatingInApi } from "../src/lib/practice-log-api.ts";
import { filterLogsByRoute, filterLogsBySelfRating, getRouteAnalysis, getSelfRatingBreakdown } from "../src/lib/analytics-route-rating.ts";
import {
  createRouteInApi,
  deleteRouteInApi,
  fetchRoutesFromApi,
  parseRouteBody,
  parseRoutePatchBody,
  routeIdForDiscipline,
  routesForDiscipline,
  sortRoutesForSettings,
  updateRouteInApi,
  validatePracticeLogRoute,
  toExtensionRouteResponse,
} from "../src/lib/route-api.ts";
import { authorizeExtensionRequest } from "../src/lib/extension-auth-core.ts";
import { SELF_RATING_SYMBOLS } from "../src/lib/types.ts";

const baseLog = {
  date: "2026-08-24",
  discipline: "Cards",
  mode: "train",
  score: 52,
  time: 60,
  result: null,
  opponentName: null,
  officialTournamentId: null,
  officialRound: null,
  memo: null,
  source: "manual",
};

test("Cards route creation is accepted and its name is trimmed", () => {
  const cards = parseRouteBody({ name: "  West wall  ", discipline: "Cards", memo: null });
  assert.ok("data" in cards && cards.data.name === "West wall");
});

test("Numbers route creation is accepted", () => {
  const numbers = parseRouteBody({ name: "Numbers route", discipline: "Numbers", memo: "memo" });
  assert.ok("data" in numbers);
});

test("International Names routes are rejected", () => {
  assert.ok("error" in parseRouteBody({ name: "Invalid", discipline: "International Names" }));
});

test("duplicate name in one discipline is rejected by the compound uniqueness rule", () => {
  const keys = new Set<string>();
  const create = (discipline: string, name: string) => {
    const key = `${discipline}:${name}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  };
  assert.equal(create("Cards", "A"), true);
  assert.equal(create("Cards", "A"), false);
});

test("the same route name is allowed in another discipline", () => {
  const keys = new Set(["Cards:A"]);
  const create = (discipline: string, name: string) => {
    const key = `${discipline}:${name}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  };
  assert.equal(create("Words", "A"), true);
});

test("route patch accepts name, discipline, and memo updates", () => {
  const parsed = parseRoutePatchBody({ name: " Updated ", discipline: "Images", memo: null });
  assert.deepEqual("data" in parsed && parsed.data, { name: "Updated", discipline: "Images", memo: null });
});

test("migration enforces compound uniqueness and nulls routeId when a route is deleted", () => {
  const sql = readFileSync(new URL("../prisma/migrations/20260824000000_add_routes_and_self_rating/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /UNIQUE INDEX "Route_discipline_name_key"/);
  assert.match(sql, /ON DELETE SET NULL/);
});

test("practice log parser accepts routeId", () => {
  const parsed = parsePracticeLogBody({ ...baseLog, routeId: "route-1" });
  assert.ok("data" in parsed && parsed.data.routeId === "route-1");
});

test("practice route must exist", async () => {
  const missing = await validatePracticeLogRoute({ routeId: "missing", discipline: "Cards" }, async () => null);
  assert.match(missing ?? "", /existing/);
});

test("practice route discipline must match", async () => {
  const mismatch = await validatePracticeLogRoute({ routeId: "route-1", discipline: "Cards" }, async () => ({ id: "route-1", discipline: "Words" }));
  assert.match(mismatch ?? "", /match/);
});

test("matching practice route is accepted", async () => {
  const valid = await validatePracticeLogRoute({ routeId: "route-1", discipline: "Cards" }, async () => ({ id: "route-1", discipline: "Cards" }));
  assert.equal(valid, null);
});

test("Names cannot reference a route", async () => {
  const find = async () => ({ id: "route-1", discipline: "Cards" as const });
  assert.match((await validatePracticeLogRoute({ routeId: "route-1", discipline: "Names" }, find)) ?? "", /not available/);
});

test("International Names cannot reference a route", async () => {
  const find = async () => ({ id: "route-1", discipline: "Cards" as const });
  assert.match((await validatePracticeLogRoute({ routeId: "route-1", discipline: "InternationalNames" }, find)) ?? "", /not available/);
});

for (const selfRating of ["good", "neutral", "bad"] as const) {
  test(`practice log parser accepts selfRating ${selfRating}`, () => {
    const parsed = parsePracticeLogBody({ ...baseLog, selfRating });
    assert.ok("data" in parsed && parsed.data.selfRating === selfRating);
  });
}

test("practice log parser rejects an invalid selfRating", () => {
  const parsed = parsePracticeLogBody({ ...baseLog, selfRating: "excellent" });
  assert.ok("error" in parsed);
});

test("existing extension-style payload remains valid without new fields", () => {
  const parsed = parsePracticeLogBody({ ...baseLog, source: "extension", externalId: "trial-1" });
  assert.ok("data" in parsed && parsed.data.routeId === null && parsed.data.selfRating === null);
});

test("Route API client fetches the route list without caching", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return Response.json({ routes: [{ id: "route-1", name: "West", discipline: "Cards", memo: null }] });
  };
  try {
    const routes = await fetchRoutesFromApi();
    assert.equal(routes[0]?.name, "West");
    assert.equal(requestInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Route API client creates Cards and Numbers routes", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method, body: String(init?.body) });
    const payload = JSON.parse(String(init?.body)) as { name: string; discipline: string; memo: string | null };
    return Response.json({ id: `route-${requests.length}`, ...payload }, { status: 201 });
  };
  try {
    await createRouteInApi({ name: "West", discipline: "Cards", memo: null });
    await createRouteInApi({ name: "Home", discipline: "Numbers", memo: null });
    assert.deepEqual(requests.map((request) => [request.url, request.method]), [["/api/routes", "POST"], ["/api/routes", "POST"]]);
    assert.deepEqual(requests.map((request) => JSON.parse(request.body ?? "{}").discipline), ["Cards", "Numbers"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Route API client edits and deletes a route", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method });
    if (init?.method === "DELETE") return Response.json({ ok: true });
    return Response.json({ id: "route/1", name: "Edited", discipline: "Words", memo: "memo" });
  };
  try {
    const updated = await updateRouteInApi("route/1", { name: "Edited", discipline: "Words", memo: "memo" });
    await deleteRouteInApi("route/1");
    assert.equal(updated.name, "Edited");
    assert.deepEqual(requests, [
      { url: "/api/routes/route%2F1", method: "PATCH" },
      { url: "/api/routes/route%2F1", method: "DELETE" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Route API client presents a friendly duplicate error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "duplicate" }, { status: 409 });
  try {
    await assert.rejects(
      createRouteInApi({ name: "West", discipline: "Cards", memo: null }),
      /同じ種目に同名のルートが既に存在します/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Settings route order is Cards, Numbers, Images, Words and excludes unsupported disciplines", () => {
  const routes = sortRoutesForSettings([
    { id: "words", name: "B", discipline: "Words" },
    { id: "names", name: "Hidden", discipline: "Names" },
    { id: "images", name: "C", discipline: "Images" },
    { id: "numbers", name: "D", discipline: "Numbers" },
    { id: "cards-b", name: "B", discipline: "Cards" },
    { id: "cards-a", name: "A", discipline: "Cards" },
  ]);
  assert.deepEqual(routes.map((route) => route.id), ["cards-a", "cards-b", "numbers", "images", "words"]);
});

test("Route hook does not use localStorage", () => {
  const source = readFileSync(new URL("../src/hooks/use-routes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage/);
});

const practiceRoutes = [
  { id: "cards-b", name: "B", discipline: "Cards" as const },
  { id: "numbers", name: "Home", discipline: "Numbers" as const },
  { id: "cards-a", name: "A", discipline: "Cards" as const },
];

test("Practice Cards selection shows only Cards routes in name order", () => {
  assert.deepEqual(routesForDiscipline(practiceRoutes, "Cards").map((route) => route.id), ["cards-a", "cards-b"]);
});

test("Practice Numbers selection shows only Numbers routes", () => {
  assert.deepEqual(routesForDiscipline(practiceRoutes, "Numbers").map((route) => route.id), ["numbers"]);
});

test("Practice International Names and Names selections have no Route options", () => {
  assert.deepEqual(routesForDiscipline(practiceRoutes, "International Names"), []);
  assert.deepEqual(routesForDiscipline(practiceRoutes, "Names"), []);
});

test("changing discipline clears a mismatched route and retains a matching route", () => {
  assert.equal(routeIdForDiscipline("cards-a", "Numbers", practiceRoutes), null);
  assert.equal(routeIdForDiscipline("cards-a", "Cards", practiceRoutes), "cards-a");
});

test("Practice payload accepts selected and unselected routes when Route API is unavailable", () => {
  const selected = parsePracticeLogBody({ ...baseLog, routeId: "cards-a", selfRating: "good" });
  const unselected = parsePracticeLogBody({ ...baseLog, routeId: null, selfRating: null });
  assert.ok("data" in selected && selected.data.routeId === "cards-a" && selected.data.selfRating === "good");
  assert.ok("data" in unselected && unselected.data.routeId === null && unselected.data.selfRating === null);
});

test("self rating values render as circle, triangle, and cross", () => {
  assert.deepEqual(SELF_RATING_SYMBOLS, { good: "○", neutral: "▲", bad: "×" });
});

test("Practice UI contains Japanese and English Route and self-rating labels", () => {
  const source = readFileSync(new URL("../src/components/CoachApp.tsx", import.meta.url), "utf8");
  for (const text of ["ルート", "未選択", "自己評価", "未評価", "Route", "None", "Self rating", "Not rated"]) {
    assert.match(source, new RegExp(text));
  }
});

test("self-rating controls include dark-mode styles and deleted routes are optional", () => {
  const source = readFileSync(new URL("../src/components/CoachApp.tsx", import.meta.url), "utf8");
  assert.match(source, /dark:text-emerald-200/);
  assert.match(source, /log\.route\?\.name/);
});

const analyticsLogs = [
  { id: "1", date: "2026-08-24", discipline: "Cards" as const, mode: "train" as const, routeId: "cards-a", route: { id: "cards-a", name: "West", discipline: "Cards" as const }, selfRating: "good" as const, score: 50, time: 20, attempts: 1, successes: 1, failures: 0, averageRecord: 20, bestRecord: 20, memo: "" },
  { id: "2", date: "2026-08-23", discipline: "Cards" as const, mode: "train" as const, routeId: "cards-a", route: { id: "cards-a", name: "West", discipline: "Cards" as const }, selfRating: "neutral" as const, score: 40, time: 30, attempts: 1, successes: 1, failures: 0, averageRecord: 30, bestRecord: 30, memo: "" },
  { id: "3", date: "2026-08-22", discipline: "Cards" as const, mode: "train" as const, routeId: null, route: null, selfRating: "bad" as const, score: 30, time: 40, attempts: 1, successes: 1, failures: 0, averageRecord: 40, bestRecord: 40, memo: "" },
  { id: "4", date: "2026-08-21", discipline: "Numbers" as const, mode: "train" as const, routeId: "numbers", route: { id: "numbers", name: "Home", discipline: "Numbers" as const }, selfRating: null, score: 80, time: 50, attempts: 1, successes: 1, failures: 0, averageRecord: 50, bestRecord: 50, memo: "" },
];

test("Analytics filters by assigned and unassigned Route", () => {
  assert.deepEqual(filterLogsByRoute(analyticsLogs, "cards-a").map((log) => log.id), ["1", "2"]);
  assert.deepEqual(filterLogsByRoute(analyticsLogs, "unassigned").map((log) => log.id), ["3"]);
});

test("Analytics filters good, neutral, bad, and unrated self ratings", () => {
  assert.deepEqual(filterLogsBySelfRating(analyticsLogs, "good").map((log) => log.id), ["1"]);
  assert.deepEqual(filterLogsBySelfRating(analyticsLogs, "neutral").map((log) => log.id), ["2"]);
  assert.deepEqual(filterLogsBySelfRating(analyticsLogs, "bad").map((log) => log.id), ["3"]);
  assert.deepEqual(filterLogsBySelfRating(analyticsLogs, "unrated").map((log) => log.id), ["4"]);
});

test("Analytics combines Route and self-rating filters with AND semantics", () => {
  assert.deepEqual(filterLogsBySelfRating(filterLogsByRoute(analyticsLogs, "cards-a"), "neutral").map((log) => log.id), ["2"]);
});

test("Analytics self-rating breakdown includes unrated logs", () => {
  assert.deepEqual(getSelfRatingBreakdown(analyticsLogs), { good: 1, neutral: 1, bad: 1, unrated: 1 });
});

test("Route analysis calculates count and average score and time", () => {
  const analysis = getRouteAnalysis(analyticsLogs.slice(0, 3), practiceRoutes);
  assert.deepEqual(analysis.map((item) => item.routeName), ["A", null]);
  assert.deepEqual(analysis.map((item) => item.count), [2, 1]);
  assert.equal(analysis[0]?.averageScore, 45);
  assert.equal(analysis[0]?.averageTime, 25);
});

for (const selfRating of ["good", "neutral", "bad", null] as const) {
  test(`self-rating-only PATCH accepts ${selfRating ?? "unrated"}`, () => {
    const parsed = parsePracticeLogSelfRatingPatch({ selfRating });
    assert.ok(parsed && "data" in parsed && parsed.data.selfRating === selfRating);
  });
}

test("Analytics self-rating API sends a partial PATCH and returns its response", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; method?: string; body?: string } | undefined;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), method: init?.method, body: String(init?.body) };
    return Response.json({ ...analyticsLogs[0], date: "2026-08-24", source: "manual", selfRating: "bad" });
  };
  try {
    const response = await updatePracticeLogSelfRatingInApi("log/1", "bad");
    assert.equal(response.selfRating, "bad");
    assert.deepEqual(captured, { url: "/api/practice-logs/log%2F1", method: "PATCH", body: JSON.stringify({ selfRating: "bad" }) });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Analytics surfaces self-rating PATCH failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "Self rating update failed." }, { status: 500 });
  try {
    await assert.rejects(updatePracticeLogSelfRatingInApi("log-1", "good"), /Self rating update failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Analytics UI includes bilingual labels and dark-mode styles", () => {
  const source = readFileSync(new URL("../src/components/CoachApp.tsx", import.meta.url), "utf8");
  for (const text of ["ルート別分析", "自己評価の内訳", "Route analysis", "Self rating breakdown", "Unassigned"]) assert.match(source, new RegExp(text));
  assert.match(source, /dark:border-zinc-700 dark:bg-zinc-900/);
});

test("Extension routes reject a request without a Bearer token", () => {
  const previous = process.env.EXTENSION_API_TOKEN;
  process.env.EXTENSION_API_TOKEN = "test-extension-token";
  try {
    assert.deepEqual(authorizeExtensionRequest(new Request("https://example.test/api/extension/routes")), { ok: false, status: 401, error: "Unauthorized." });
  } finally {
    if (previous === undefined) delete process.env.EXTENSION_API_TOKEN;
    else process.env.EXTENSION_API_TOKEN = previous;
  }
});

test("Extension routes accept the configured token and expose only minimal fields", () => {
  const previous = process.env.EXTENSION_API_TOKEN;
  process.env.EXTENSION_API_TOKEN = "test-extension-token";
  try {
    const request = new Request("https://example.test/api/extension/routes", { headers: { Authorization: "Bearer test-extension-token" } });
    assert.deepEqual(authorizeExtensionRequest(request), { ok: true });
    assert.deepEqual(toExtensionRouteResponse({ id: "route-1", name: "West", discipline: "Cards" }), { id: "route-1", name: "West", discipline: "Cards" });
  } finally {
    if (previous === undefined) delete process.env.EXTENSION_API_TOKEN;
    else process.env.EXTENSION_API_TOKEN = previous;
  }
});

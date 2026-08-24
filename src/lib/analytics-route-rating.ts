import type { PracticeLog, Route, SelfRating } from "./types";

export type AnalyticsRouteFilter = "all" | "unassigned" | string;
export type AnalyticsSelfRatingFilter = "all" | "unrated" | SelfRating;

export function filterLogsByRoute(logs: PracticeLog[], routeFilter: AnalyticsRouteFilter) {
  if (routeFilter === "all") return logs;
  if (routeFilter === "unassigned") return logs.filter((log) => !log.routeId);
  return logs.filter((log) => log.routeId === routeFilter);
}

export function filterLogsBySelfRating(logs: PracticeLog[], selfRatingFilter: AnalyticsSelfRatingFilter) {
  if (selfRatingFilter === "all") return logs;
  if (selfRatingFilter === "unrated") return logs.filter((log) => !log.selfRating);
  return logs.filter((log) => log.selfRating === selfRatingFilter);
}

export function getSelfRatingBreakdown(logs: PracticeLog[]) {
  return logs.reduce(
    (counts, log) => {
      counts[log.selfRating ?? "unrated"] += 1;
      return counts;
    },
    { good: 0, neutral: 0, bad: 0, unrated: 0 },
  );
}

export type RouteAnalysisItem = {
  routeId: string | null;
  routeName: string | null;
  count: number;
  averageScore: number;
  averageTime: number;
  selfRatings: ReturnType<typeof getSelfRatingBreakdown>;
};

export function getRouteAnalysis(logs: PracticeLog[], routes: Route[]): RouteAnalysisItem[] {
  const routeNames = new Map(routes.map((route) => [route.id, route.name]));
  const grouped = new Map<string, PracticeLog[]>();
  for (const log of logs) {
    const key = log.routeId && routeNames.has(log.routeId) ? log.routeId : "unassigned";
    grouped.set(key, [...(grouped.get(key) ?? []), log]);
  }

  return [...grouped.entries()]
    .map(([key, items]) => ({
      routeId: key === "unassigned" ? null : key,
      routeName: key === "unassigned" ? null : routeNames.get(key) ?? null,
      count: items.length,
      averageScore: items.length ? items.reduce((sum, log) => sum + (log.score ?? 0), 0) / items.length : 0,
      averageTime: items.length ? items.reduce((sum, log) => sum + (log.time ?? 0), 0) / items.length : 0,
      selfRatings: getSelfRatingBreakdown(items),
    }))
    .sort((a, b) => {
      if (a.routeId === null) return 1;
      if (b.routeId === null) return -1;
      return (a.routeName ?? "").localeCompare(b.routeName ?? "", "ja");
    });
}

import type { Discipline as PrismaDiscipline, Prisma, Route as PrismaRoute } from "@prisma/client";
import type { Route } from "@/lib/types";

export const ROUTE_DISCIPLINES = ["Cards", "Numbers", "Images", "Words"] as const;
export type RouteDiscipline = (typeof ROUTE_DISCIPLINES)[number];
export type RouteInput = {
  name: string;
  discipline: RouteDiscipline;
  memo: string | null;
};

export type RoutesResponse = { routes: Route[] };

const routeDisciplineValues = new Set<string>(ROUTE_DISCIPLINES);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMemo(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

export function isRouteDiscipline(value: string): value is RouteDiscipline {
  return routeDisciplineValues.has(value);
}

export function parseRouteBody(body: unknown): { data: Prisma.RouteUncheckedCreateInput } | { error: string } {
  if (!isObject(body)) return { error: "JSON object is required." };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "name is required." };

  const discipline = typeof body.discipline === "string" && isRouteDiscipline(body.discipline)
    ? body.discipline
    : undefined;
  if (!discipline) return { error: "discipline must be Cards, Numbers, Images, or Words." };

  const memo = parseMemo(body.memo);
  if (memo === undefined) return { error: "memo must be a string or null." };

  return { data: { name, discipline, memo } };
}

export function parseRoutePatchBody(body: unknown): { data: Prisma.RouteUncheckedUpdateInput } | { error: string } {
  if (!isObject(body)) return { error: "JSON object is required." };

  const data: Prisma.RouteUncheckedUpdateInput = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "name is required." };
    data.name = name;
  }
  if ("discipline" in body) {
    if (typeof body.discipline !== "string" || !isRouteDiscipline(body.discipline)) {
      return { error: "discipline must be Cards, Numbers, Images, or Words." };
    }
    data.discipline = body.discipline;
  }
  if ("memo" in body) {
    const memo = parseMemo(body.memo);
    if (memo === undefined) return { error: "memo must be a string or null." };
    data.memo = memo;
  }
  if (Object.keys(data).length === 0) return { error: "At least one field is required." };
  return { data };
}

export function toRouteResponse(route: PrismaRoute): Route {
  return {
    ...route,
    discipline: route.discipline === "InternationalNames" ? "International Names" : route.discipline,
    createdAt: route.createdAt.toISOString(),
    updatedAt: route.updatedAt.toISOString(),
  };
}

export function toExtensionRouteResponse(route: Pick<PrismaRoute, "id" | "name" | "discipline">) {
  return { id: route.id, name: route.name, discipline: route.discipline };
}

export function isUniqueConstraintError(error: unknown) {
  return isObject(error) && error.code === "P2002";
}

export type PracticeRouteCandidate = {
  routeId?: string | null;
  discipline: PrismaDiscipline;
};

export type RouteLookup = (id: string) => Promise<{ id: string; discipline: PrismaDiscipline } | null>;

export async function validatePracticeLogRoute(data: PracticeRouteCandidate, findRoute: RouteLookup) {
  if (!data.routeId) return null;
  if (data.discipline === "Names" || data.discipline === "InternationalNames") {
    return "Routes are not available for this discipline.";
  }

  const route = await findRoute(data.routeId);
  if (!route) return "routeId does not reference an existing route.";
  if (route.discipline !== data.discipline) return "Route discipline must match practice log discipline.";
  return null;
}

async function readRouteApiError(response: Response, fallback: string) {
  if (response.status === 409) return "同じ種目に同名のルートが既に存在します。";
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchRoutesFromApi() {
  const response = await fetch("/api/routes", { cache: "no-store" });
  if (!response.ok) throw new Error(await readRouteApiError(response, "ルートの読み込みに失敗しました。"));
  return ((await response.json()) as RoutesResponse).routes;
}

export async function createRouteInApi(payload: RouteInput) {
  const response = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readRouteApiError(response, "ルートの追加に失敗しました。"));
  return (await response.json()) as Route;
}

export async function updateRouteInApi(id: string, payload: RouteInput) {
  const response = await fetch(`/api/routes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readRouteApiError(response, "ルートの更新に失敗しました。"));
  return (await response.json()) as Route;
}

export async function deleteRouteInApi(id: string) {
  const response = await fetch(`/api/routes/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readRouteApiError(response, "ルートの削除に失敗しました。"));
}

export function sortRoutesForSettings(routes: Route[]) {
  return routes
    .filter((route): route is Route & { discipline: RouteDiscipline } => isRouteDiscipline(route.discipline))
    .slice()
    .sort((a, b) => {
      const disciplineOrder = ROUTE_DISCIPLINES.indexOf(a.discipline) - ROUTE_DISCIPLINES.indexOf(b.discipline);
      return disciplineOrder || a.name.localeCompare(b.name, "ja");
    });
}

export function routesForDiscipline(routes: Route[], discipline: string) {
  if (!isRouteDiscipline(discipline)) return [];
  return routes
    .filter((route) => route.discipline === discipline)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function routeIdForDiscipline(routeId: string | null | undefined, discipline: string, routes: Route[]) {
  if (!routeId || !isRouteDiscipline(discipline)) return null;
  return routes.some((route) => route.id === routeId && route.discipline === discipline) ? routeId : null;
}

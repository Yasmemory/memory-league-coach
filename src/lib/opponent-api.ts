import type { Opponent as PrismaOpponent, Prisma } from "@prisma/client";
import { DISCIPLINES, Discipline, Opponent } from "@/lib/types";

type OpponentBody = {
  name?: unknown;
  averages?: unknown;
  successRates?: unknown;
  memo?: unknown;
};

export type OpponentResponse = Omit<PrismaOpponent, "averages" | "successRates"> & {
  averages: Record<Discipline, number>;
  successRates: Record<Discipline, number>;
};

export type OpponentRequest = Omit<Opponent, "id">;

function emptyDisciplineNumbers() {
  return Object.fromEntries(DISCIPLINES.map((discipline) => [discipline, 0])) as Record<Discipline, number>;
}

function normalizeDisciplineNumbers(value: unknown) {
  const result = emptyDisciplineNumbers();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return result;
  const input = value as Record<string, unknown>;
  for (const discipline of DISCIPLINES) {
    const item = input[discipline];
    result[discipline] = typeof item === "number" && Number.isFinite(item) ? item : 0;
  }
  return result;
}

function parseNullableString(value: unknown) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : undefined;
}

export function toOpponentResponse(opponent: PrismaOpponent): OpponentResponse {
  return {
    ...opponent,
    averages: normalizeDisciplineNumbers(opponent.averages),
    successRates: normalizeDisciplineNumbers(opponent.successRates),
  };
}

export function opponentFromApi(opponent: OpponentResponse): Opponent {
  return {
    id: opponent.id,
    name: opponent.name,
    averages: opponent.averages,
    successRates: opponent.successRates,
    memo: opponent.memo ?? "",
  };
}

export function parseOpponentBody(body: unknown): { data: Prisma.OpponentUncheckedCreateInput } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "JSON object is required." };
  const input = body as OpponentBody;
  if (typeof input.name !== "string" || input.name.trim().length === 0) return { error: "name is required." };
  const memo = parseNullableString(input.memo);
  if (memo === undefined) return { error: "memo must be a string or null." };
  const averages = normalizeDisciplineNumbers(input.averages);
  const successRates = normalizeDisciplineNumbers(input.successRates);

  return {
    data: {
      name: input.name.trim(),
      averages,
      successRates,
      memo,
    },
  };
}

async function readApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchOpponentsFromApi() {
  const response = await fetch("/api/opponents", { cache: "no-store" });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to fetch opponents."));
  const body = (await response.json()) as { opponents: OpponentResponse[] };
  return body.opponents.map(opponentFromApi);
}

export async function createOpponentInApi(payload: OpponentRequest) {
  const response = await fetch("/api/opponents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to save opponent."));
  return opponentFromApi((await response.json()) as OpponentResponse);
}

export async function updateOpponentInApi(id: string, payload: OpponentRequest) {
  const response = await fetch(`/api/opponents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to update opponent."));
  return opponentFromApi((await response.json()) as OpponentResponse);
}

export async function deleteOpponentInApi(id: string) {
  const response = await fetch(`/api/opponents/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to delete opponent."));
}

import type { OfficialTournament as PrismaOfficialTournament, Prisma, Tournament as PrismaTournament } from "@prisma/client";
import type { OfficialTournament, Tournament } from "@/lib/types";

type TournamentBody = {
  name?: unknown;
  date?: unknown;
  goal?: unknown;
  memo?: unknown;
};

type OfficialTournamentBody = {
  name?: unknown;
  date?: unknown;
  memo?: unknown;
};

export type TournamentResponse = Omit<PrismaTournament, "date"> & {
  date: string;
};

export type OfficialTournamentResponse = Omit<PrismaOfficialTournament, "date"> & {
  date: string;
};

export type TournamentRequest = Omit<Tournament, "id">;
export type OfficialTournamentRequest = Omit<OfficialTournament, "id">;

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNullableString(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toTournamentResponse(tournament: PrismaTournament): TournamentResponse {
  return { ...tournament, date: dateOnly(tournament.date) };
}

export function toOfficialTournamentResponse(tournament: PrismaOfficialTournament): OfficialTournamentResponse {
  return { ...tournament, date: dateOnly(tournament.date) };
}

export function toExtensionOfficialTournamentResponse(tournament: Pick<PrismaOfficialTournament, "id" | "name" | "date">) {
  return { id: tournament.id, name: tournament.name, date: dateOnly(tournament.date) };
}

export function tournamentFromApi(tournament: TournamentResponse): Tournament {
  return {
    id: tournament.id,
    name: tournament.name,
    date: tournament.date,
    goal: tournament.goal ?? "",
    memo: tournament.memo ?? "",
  };
}

export function officialTournamentFromApi(tournament: OfficialTournamentResponse): OfficialTournament {
  return {
    id: tournament.id,
    name: tournament.name,
    date: tournament.date,
    memo: tournament.memo ?? "",
  };
}

export function parseTournamentBody(body: unknown): { data: Prisma.TournamentUncheckedCreateInput } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "JSON object is required." };
  const input = body as TournamentBody;
  if (typeof input.name !== "string" || input.name.trim().length === 0) return { error: "name is required." };
  const date = parseDate(input.date);
  if (!date) return { error: "date must be YYYY-MM-DD." };
  const goal = parseNullableString(input.goal);
  if (goal === undefined) return { error: "goal must be a string or null." };
  const memo = parseNullableString(input.memo);
  if (memo === undefined) return { error: "memo must be a string or null." };
  return { data: { name: input.name.trim(), date, goal, memo } };
}

export function parseOfficialTournamentBody(body: unknown): { data: Prisma.OfficialTournamentUncheckedCreateInput } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "JSON object is required." };
  const input = body as OfficialTournamentBody;
  if (typeof input.name !== "string" || input.name.trim().length === 0) return { error: "name is required." };
  const date = parseDate(input.date);
  if (!date) return { error: "date must be YYYY-MM-DD." };
  const memo = parseNullableString(input.memo);
  if (memo === undefined) return { error: "memo must be a string or null." };
  return { data: { name: input.name.trim(), date, memo } };
}

async function readApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchTournamentsFromApi() {
  const response = await fetch("/api/tournaments", { cache: "no-store" });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to fetch tournaments."));
  const body = (await response.json()) as { tournaments: TournamentResponse[] };
  return body.tournaments.map(tournamentFromApi);
}

export async function createTournamentInApi(payload: TournamentRequest) {
  const response = await fetch("/api/tournaments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to save tournament."));
  return tournamentFromApi((await response.json()) as TournamentResponse);
}

export async function updateTournamentInApi(id: string, payload: TournamentRequest) {
  const response = await fetch(`/api/tournaments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to update tournament."));
  return tournamentFromApi((await response.json()) as TournamentResponse);
}

export async function deleteTournamentInApi(id: string) {
  const response = await fetch(`/api/tournaments/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to delete tournament."));
}

export async function fetchOfficialTournamentsFromApi() {
  const response = await fetch("/api/official-tournaments", { cache: "no-store" });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to fetch official tournaments."));
  const body = (await response.json()) as { officialTournaments: OfficialTournamentResponse[] };
  return body.officialTournaments.map(officialTournamentFromApi);
}

export async function createOfficialTournamentInApi(payload: OfficialTournamentRequest) {
  const response = await fetch("/api/official-tournaments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to save official tournament."));
  return officialTournamentFromApi((await response.json()) as OfficialTournamentResponse);
}

export async function updateOfficialTournamentInApi(id: string, payload: OfficialTournamentRequest) {
  const response = await fetch(`/api/official-tournaments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to update official tournament."));
  return officialTournamentFromApi((await response.json()) as OfficialTournamentResponse);
}

export async function deleteOfficialTournamentInApi(id: string) {
  const response = await fetch(`/api/official-tournaments/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readApiError(response, "Failed to delete official tournament."));
}

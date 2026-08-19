import type { Discipline, LogMode, LogSource, MatchResult, PracticeLog, Prisma } from "@prisma/client";

export type PracticeLogResponse = Omit<PracticeLog, "discipline" | "source" | "date"> & {
  date: string;
  discipline: "Cards" | "Images" | "International Names" | "Names" | "Numbers" | "Words";
  source: "manual" | "import" | "extension";
  officialTournament?: {
    id: string;
    name: string;
    date: string;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

export type PracticeLogsResponse = {
  logs: PracticeLogResponse[];
};

export type PracticeLogRequest = {
  date: string;
  discipline: PracticeLogResponse["discipline"];
  mode: LogMode;
  score: number | null;
  time: number | null;
  result: "win" | "loss" | null;
  opponentName: string | null;
  officialTournamentId: string | null;
  officialRound: string | null;
  memo: string | null;
  source: "manual" | "import" | "extension";
};

export type PracticeLogWithTournament = PracticeLog & {
  officialTournament?: {
    id: string;
    name: string;
    date: Date;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

const disciplineMap: Record<string, Discipline> = {
  Cards: "Cards",
  Images: "Images",
  "International Names": "InternationalNames",
  Names: "Names",
  Numbers: "Numbers",
  Words: "Words",
};

const modeValues = new Set<LogMode>(["train", "rated", "official"]);
const resultValues = new Set<MatchResult>(["win", "loss"]);
const sourceMap: Record<string, LogSource> = {
  manual: "manual",
  import: "imported",
  extension: "extension",
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function toPracticeLogResponse(log: PracticeLogWithTournament): PracticeLogResponse {
  return {
    ...log,
    date: dateOnly(log.date),
    discipline: log.discipline === "InternationalNames" ? "International Names" : log.discipline,
    source: log.source === "imported" ? "import" : log.source,
    officialTournament: log.officialTournament
      ? {
          ...log.officialTournament,
          date: dateOnly(log.officialTournament.date),
        }
      : null,
  };
}

export async function readPracticeLogApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchPracticeLogsFromApi(fallback = "Failed to fetch practice logs.") {
  const response = await fetch("/api/practice-logs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readPracticeLogApiError(response, fallback));
  }

  const body = (await response.json()) as PracticeLogsResponse;
  return body.logs;
}

export async function createPracticeLogInApi(payload: PracticeLogRequest, fallback = "Failed to save practice log.") {
  const response = await fetch("/api/practice-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readPracticeLogApiError(response, fallback));
  }

  return (await response.json()) as PracticeLogResponse;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function parseNullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

export function parsePracticeLogBody(body: unknown): { data: Prisma.PracticeLogUncheckedCreateInput } | { error: string } {
  if (!isObject(body)) {
    return { error: "JSON object is required." };
  }

  const date = parseDate(body.date);
  if (!date) return { error: "date must be YYYY-MM-DD." };

  const discipline = typeof body.discipline === "string" ? disciplineMap[body.discipline] : undefined;
  if (!discipline) return { error: "discipline is invalid." };

  const mode = typeof body.mode === "string" && modeValues.has(body.mode as LogMode) ? (body.mode as LogMode) : undefined;
  if (!mode) return { error: "mode is invalid." };

  const score = parseNullableNumber(body.score);
  if (score === undefined) return { error: "score must be a number or null." };

  const time = parseNullableNumber(body.time);
  if (time === undefined) return { error: "time must be a number or null." };

  const result = body.result === null || body.result === undefined ? null : typeof body.result === "string" && resultValues.has(body.result as MatchResult) ? (body.result as MatchResult) : undefined;
  if (result === undefined) return { error: "result must be win, loss, or null." };

  const opponentName = parseNullableString(body.opponentName);
  if (opponentName === undefined) return { error: "opponentName must be a string or null." };

  const officialTournamentId = parseNullableString(body.officialTournamentId);
  if (officialTournamentId === undefined) return { error: "officialTournamentId must be a string or null." };

  const officialRound = parseNullableString(body.officialRound);
  if (officialRound === undefined) return { error: "officialRound must be a string or null." };

  const memo = parseNullableString(body.memo);
  if (memo === undefined) return { error: "memo must be a string or null." };

  const source = typeof body.source === "string" ? sourceMap[body.source] : undefined;
  if (!source) return { error: "source is invalid." };

  return {
    data: {
      date,
      discipline,
      mode,
      score,
      time,
      result,
      opponentName,
      officialTournamentId,
      officialRound,
      memo,
      source,
    },
  };
}

export function createExtensionFingerprint(data: Prisma.PracticeLogUncheckedCreateInput) {
  const date = data.date instanceof Date ? dateOnly(data.date) : String(data.date);
  const score = data.score === null || data.score === undefined ? "" : String(data.score);
  const time = data.time === null || data.time === undefined ? "" : String(data.time);
  const opponentName = typeof data.opponentName === "string" ? data.opponentName.trim().toLowerCase() : "";
  const result = data.result ?? "";

  return [date, data.discipline, score, time, opponentName, result].join("|");
}

export function toPracticeLogUpdateInput(data: Prisma.PracticeLogUncheckedCreateInput): Prisma.PracticeLogUncheckedUpdateInput {
  return {
    date: data.date,
    discipline: data.discipline,
    mode: data.mode,
    score: data.score,
    time: data.time,
    result: data.result,
    opponentName: data.opponentName,
    officialTournamentId: data.officialTournamentId,
    officialRound: data.officialRound,
    memo: data.memo,
    source: data.source,
  };
}

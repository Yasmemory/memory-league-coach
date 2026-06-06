import { CoachData, Discipline, DISCIPLINES, LogMode, LOG_MODES, MatchResult, OfficialTournament, PracticeLog, Tournament } from "@/lib/types";

export type ImportPreviewLog = {
  date: string;
  discipline: Discipline;
  mode: LogMode;
  score: number;
  time: number;
  success: boolean;
};

export type ImportParseResult = {
  logs: ImportPreviewLog[];
  errors: string[];
};

export type ParsedMatchResult = {
  winner: string;
  loser: string;
  discipline: Discipline;
  winnerScore: number;
  winnerTime: number;
  loserScore: number;
  loserTime: number;
  sourceText: string;
};

export type MatchImportPreviewLog = {
  date: string;
  discipline: Discipline;
  mode: Extract<LogMode, "rated" | "official">;
  score: number;
  time: number;
  opponentName: string;
  result: MatchResult;
  officialTournamentId?: string;
  officialRound?: string;
  memo?: string;
};

export type MatchParseResult = {
  matches: ParsedMatchResult[];
  errors: string[];
  warnings: string[];
};

export function getModeLabel(mode?: LogMode) {
  const labels: Record<LogMode, string> = {
    train: "Train",
    rated: "Rated",
    official: "Official",
  };
  return labels[mode ?? "train"];
}

export function getModeBadgeStyle(mode?: LogMode) {
  const styles: Record<LogMode, string> = {
    train: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rated: "border-sky-200 bg-sky-50 text-sky-800",
    official: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return styles[mode ?? "train"];
}

export function isSuccessfulLog(log: Pick<PracticeLog, "score"> | Pick<ImportPreviewLog, "score">) {
  return Number(log.score) >= 1;
}

export function normalizeMemoryLeagueLog(input: {
  date: string;
  discipline: Discipline;
  mode?: LogMode;
  officialTournamentId?: string;
  officialRound?: string;
  opponentName?: string;
  result?: MatchResult;
  score?: number;
  time?: number;
  memo?: string;
}): Omit<PracticeLog, "id"> {
  const mode = isLogMode(input.mode) ? input.mode : "train";
  const score = toFiniteNumber(input.score, 0);
  const time = toFiniteNumber(input.time, 0);
  const success = isSuccessfulLog({ score });

  return {
    date: input.date,
    discipline: input.discipline,
    mode,
    officialTournamentId: mode === "official" ? input.officialTournamentId || undefined : undefined,
    officialRound: mode === "official" ? input.officialRound?.trim() || undefined : undefined,
    opponentName: input.opponentName?.trim() || undefined,
    result: input.result,
    score,
    time,
    attempts: 1,
    successes: success ? 1 : 0,
    failures: success ? 0 : 1,
    averageRecord: time,
    bestRecord: time,
    memo: input.memo ?? "",
  };
}

export function normalizeStoredLog(log: PracticeLog): PracticeLog {
  const mode = isLogMode(log.mode) ? log.mode : "train";
  const score = toFiniteNumber(log.score, log.successes > 0 ? Math.max(1, log.successes) : 0);
  const time = toFiniteNumber(log.time, log.averageRecord);
  const success = isSuccessfulLog({ score });

  return {
    ...log,
    mode,
    officialTournamentId: mode === "official" ? log.officialTournamentId : undefined,
    officialRound: mode === "official" ? log.officialRound : undefined,
    opponentName: log.opponentName,
    result: log.result === "win" || log.result === "loss" ? log.result : undefined,
    score,
    time,
    attempts: toFiniteNumber(log.attempts, 1),
    successes: toFiniteNumber(log.successes, success ? 1 : 0),
    failures: toFiniteNumber(log.failures, success ? 0 : 1),
    averageRecord: toFiniteNumber(log.averageRecord, time),
    bestRecord: toFiniteNumber(log.bestRecord, time),
  };
}

export function getNextTournament(tournaments: Tournament[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return [...tournaments]
    .filter((tournament) => tournament.date && new Date(`${tournament.date}T00:00:00`) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
}

export function saveTournaments(data: CoachData, tournaments: Tournament[]): CoachData {
  return { ...data, tournaments };
}

export function getOfficialTournaments(data: CoachData) {
  return data.officialTournaments ?? [];
}

export function saveOfficialTournaments(data: CoachData, officialTournaments: OfficialTournament[]): CoachData {
  return { ...data, officialTournaments };
}

export function getOfficialTournamentName(officialTournaments: OfficialTournament[], officialTournamentId?: string) {
  if (!officialTournamentId) return "大会未設定";
  return officialTournaments.find((tournament) => tournament.id === officialTournamentId)?.name ?? "大会未設定";
}

export function filterLogsByOfficialTournament(logs: PracticeLog[], officialTournamentId: string | "all" | "unset") {
  const normalized = logs.map(normalizeStoredLog);
  if (officialTournamentId === "all") return normalized;
  if (officialTournamentId === "unset") return normalized.filter((log) => log.mode === "official" && !log.officialTournamentId);
  return normalized.filter((log) => log.mode === "official" && log.officialTournamentId === officialTournamentId);
}

export function updateOfficialTournament(officialTournaments: OfficialTournament[], updatedTournament: OfficialTournament) {
  return officialTournaments.map((tournament) => (tournament.id === updatedTournament.id ? updatedTournament : tournament));
}

export function deleteOfficialTournament(data: CoachData, id: string): CoachData {
  return {
    ...data,
    officialTournaments: getOfficialTournaments(data).filter((tournament) => tournament.id !== id),
    logs: data.logs.map((log) => (log.officialTournamentId === id ? { ...log, officialTournamentId: undefined } : log)),
  };
}

export function updatePracticeLog(logs: PracticeLog[], updatedLog: PracticeLog) {
  return logs.map((log) => (log.id === updatedLog.id ? normalizeStoredLog(updatedLog) : normalizeStoredLog(log)));
}

export function updatePracticeLogInline(logs: PracticeLog[], updatedLog: PracticeLog) {
  return updatePracticeLog(logs, updatedLog);
}

export function deletePracticeLog(logs: PracticeLog[], id: string) {
  return logs.filter((log) => log.id !== id).map(normalizeStoredLog);
}

export function parseMemoryLeagueImportText(input: {
  text: string;
  mode?: LogMode | "";
  discipline?: Discipline | "";
  date?: string;
}): ImportParseResult {
  const errors: string[] = [];
  const text = input.text.trim();

  if (!isLogMode(input.mode)) errors.push("モードを選択してください。");
  if (!isDiscipline(input.discipline)) errors.push("種目を選択してください。");
  if (!input.date) errors.push("日付を入力してください。");
  if (!text) errors.push("貼り付けテキストが空です。");

  if (errors.length > 0) return { logs: [], errors };

  const mode = input.mode as LogMode;
  const discipline = input.discipline as Discipline;
  const date = input.date as string;
  const pairPattern =
    mode === "train"
      ? /Score\s*:\s*([+-]?\d+(?:\.\d+)?)\s*[\s\S]*?Time\s*:\s*([+-]?\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/gi
      : /Time\s*:\s*([+-]?\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?\s*[\s\S]*?Score\s*:\s*([+-]?\d+(?:\.\d+)?)/gi;

  const logs: ImportPreviewLog[] = [];
  for (const match of text.matchAll(pairPattern)) {
    const scoreText = mode === "train" ? match[1] : match[2];
    const timeText = mode === "train" ? match[2] : match[1];
    const score = Number(scoreText);
    const time = Number(timeText);

    if (!Number.isFinite(score)) {
      errors.push(`スコアを数値として読めません: ${scoreText}`);
      continue;
    }
    if (!Number.isFinite(time)) {
      errors.push(`タイムを数値として読めません: ${timeText}`);
      continue;
    }

    logs.push({ date, discipline, mode, score, time, success: isSuccessfulLog({ score }) });
  }

  if (logs.length === 0) {
    if (!/Score\s*:/i.test(text)) errors.push("Scoreが見つかりません。");
    if (!/Time\s*:/i.test(text)) errors.push("Timeが見つかりません。");
    if (/Score\s*:/i.test(text) && !/Score\s*:\s*[+-]?\d+(?:\.\d+)?/i.test(text)) {
      errors.push("Scoreを数値として読めません。");
    }
    if (/Time\s*:/i.test(text) && !/Time\s*:\s*[+-]?\d+(?:\.\d+)?/i.test(text)) {
      errors.push("Timeを数値として読めません。");
    }
    if (errors.length === 0) {
      errors.push(mode === "train" ? "TrainではScore、Timeの順で貼り付けてください。" : "Rated / OfficialではTime、Scoreの順で貼り付けてください。");
    }
  }

  return { logs, errors };
}

export function parseMatchResultText(text: string): MatchParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const matches: ParsedMatchResult[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 2) {
    const headline = lines[index];
    const scoreLine = lines[index + 1];
    if (!scoreLine) {
      errors.push(`読み取れなかった行: ${headline}`);
      continue;
    }

    const headlineMatch = headline.match(/^(.+?)\s+beat\s+(.+?)\s+in\s+(.+)$/i);
    if (!headlineMatch) {
      errors.push(`読み取れなかった行: ${headline}`);
      continue;
    }

    const discipline = normalizeMatchDiscipline(headlineMatch[3]);
    if (!discipline) {
      warnings.push(`未対応の種目: ${headlineMatch[3]}`);
      continue;
    }

    const scoreMatch = scoreLine.match(/^\(\s*([+-]?\d+(?:\.\d+)?)\s+in\s+([+-]?\d+(?:\.\d+)?)\s*s?\s*\/\s*([+-]?\d+(?:\.\d+)?)\s+in\s+([+-]?\d+(?:\.\d+)?)\s*s?\s*\)/i);
    if (!scoreMatch) {
      errors.push(`score/timeを読み取れません: ${scoreLine}`);
      continue;
    }

    const winnerScore = Number(scoreMatch[1]);
    const winnerTime = Number(scoreMatch[2]);
    const loserScore = Number(scoreMatch[3]);
    const loserTime = Number(scoreMatch[4]);
    if (![winnerScore, winnerTime, loserScore, loserTime].every(Number.isFinite)) {
      errors.push(`score/timeを数値として読めません: ${scoreLine}`);
      continue;
    }

    matches.push({
      winner: headlineMatch[1].trim(),
      loser: headlineMatch[2].trim(),
      discipline,
      winnerScore,
      winnerTime,
      loserScore,
      loserTime,
      sourceText: `${headline}\n${scoreLine}`,
    });
  }

  if (matches.length === 0 && errors.length === 0 && warnings.length === 0) warnings.push("取り込み件数 0件");
  return { matches, errors, warnings };
}

export function extractPlayerLogFromMatch(match: ParsedMatchResult, playerName: string): Omit<MatchImportPreviewLog, "date" | "mode" | "officialTournamentId" | "officialRound" | "memo"> | undefined {
  const target = normalizePlayerName(playerName);
  if (!target) return undefined;
  if (normalizePlayerName(match.winner) === target) {
    return { discipline: match.discipline, score: match.winnerScore, time: match.winnerTime, opponentName: match.loser, result: "win" };
  }
  if (normalizePlayerName(match.loser) === target) {
    return { discipline: match.discipline, score: match.loserScore, time: match.loserTime, opponentName: match.winner, result: "loss" };
  }
  return undefined;
}

export function normalizeMatchImportLog(input: MatchImportPreviewLog): Omit<PracticeLog, "id"> {
  return normalizeMemoryLeagueLog({
    date: input.date,
    discipline: input.discipline,
    mode: input.mode,
    score: input.score,
    time: input.time,
    officialTournamentId: input.officialTournamentId,
    officialRound: input.officialRound,
    opponentName: input.opponentName,
    result: input.result,
    memo: input.memo ?? "対戦結果インポート",
  });
}

function isLogMode(value: unknown): value is LogMode {
  return LOG_MODES.includes(value as LogMode);
}

function isDiscipline(value: unknown): value is Discipline {
  return DISCIPLINES.includes(value as Discipline);
}

function normalizeMatchDiscipline(value: string): Discipline | undefined {
  const normalized = value.trim().toLowerCase();
  return DISCIPLINES.find((discipline) => discipline.toLowerCase() === normalized);
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function toFiniteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

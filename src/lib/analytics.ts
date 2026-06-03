import { normalizeStoredLog } from "@/app/shared";
import { Discipline, DisciplineStats, DISCIPLINES, LogMode, Opponent, PracticeLog } from "./types";

export const percent = (value: number) => `${Math.round(value)}%`;

export const record = (value: number) => (value > 0 ? value.toFixed(1) : "-");

export type PracticeMenuItem = {
  discipline: Discipline;
  count: number;
  reason: string;
};

export type WindowStats = {
  discipline: Discipline;
  size: number;
  available: number;
  isEnoughData: boolean;
  averageScore: number;
  averageTime: number;
  successRate: number;
  stability: number;
  bestScore: number;
  bestTime: number;
};

export function filterLogsByMode(logs: PracticeLog[], mode: LogMode | "all") {
  const normalized = logs.map(normalizeStoredLog);
  return mode === "all" ? normalized : normalized.filter((log) => log.mode === mode);
}

export function getDisciplineStats(logs: PracticeLog[], mode: LogMode | "all" = "all"): DisciplineStats[] {
  const normalized = filterLogsByMode(logs, mode);

  return DISCIPLINES.map((discipline) => {
    const items = normalized.filter((log) => log.discipline === discipline);
    const attempts = items.reduce((sum, log) => sum + log.attempts, 0);
    const successes = items.reduce((sum, log) => sum + log.successes, 0);
    const failures = items.reduce((sum, log) => sum + log.failures, 0);
    const scoreTotal = items.reduce((sum, log) => sum + (log.score ?? 0) * log.attempts, 0);
    const timeTotal = items.reduce((sum, log) => sum + (log.time ?? log.averageRecord) * log.attempts, 0);
    const averageScore = attempts > 0 ? scoreTotal / attempts : 0;
    const averageTime = attempts > 0 ? timeTotal / attempts : 0;
    const bestScore = items.length > 0 ? Math.max(...items.map((log) => log.score ?? 0)) : 0;
    const positiveTimes = items.map((log) => log.time ?? log.bestRecord).filter((time) => time > 0);
    const bestTime = positiveTimes.length > 0 ? Math.min(...positiveTimes) : 0;
    const successRate = attempts > 0 ? (successes / attempts) * 100 : 0;
    const averageDelta =
      items.length > 1 ? items.reduce((sum, log) => sum + Math.abs((log.time ?? 0) - averageTime), 0) / items.length : 0;
    const stability = Math.max(0, 100 - averageDelta * 2 - Math.max(0, 70 - successRate));
    const weaknessScore = (100 - successRate) + averageTime / 3 + Math.max(0, 70 - stability) / 2 - averageScore / 10;

    return {
      discipline,
      attempts,
      successes,
      failures,
      successRate,
      averageRecord: averageTime,
      bestRecord: bestTime,
      averageScore,
      averageTime,
      bestScore,
      bestTime,
      stability,
      weaknessScore,
    };
  });
}

export function calculateWindowStats(discipline: Discipline, logs: PracticeLog[], size: number, mode: LogMode | "all" = "all"): WindowStats {
  const items = filterLogsByMode(logs, mode)
    .filter((log) => log.discipline === discipline)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, size);
  const available = items.length;
  const attempts = items.reduce((sum, log) => sum + log.attempts, 0);
  const successes = items.reduce((sum, log) => sum + log.successes, 0);
  const averageScore = available > 0 ? items.reduce((sum, log) => sum + (log.score ?? 0), 0) / available : 0;
  const averageTime = available > 0 ? items.reduce((sum, log) => sum + (log.time ?? log.averageRecord), 0) / available : 0;
  const successRate = attempts > 0 ? (successes / attempts) * 100 : 0;
  const positiveTimes = items.map((log) => log.time ?? log.bestRecord).filter((time) => time > 0);
  const bestTime = positiveTimes.length > 0 ? Math.min(...positiveTimes) : 0;
  const bestScore = available > 0 ? Math.max(...items.map((log) => log.score ?? 0)) : 0;
  const averageDelta =
    available > 1 ? items.reduce((sum, log) => sum + Math.abs((log.time ?? log.averageRecord) - averageTime), 0) / available : 0;
  const stability = available > 1 ? Math.max(0, 100 - averageDelta * 3) : 0;

  return {
    discipline,
    size,
    available,
    isEnoughData: available >= size,
    averageScore,
    averageTime,
    successRate,
    stability,
    bestScore,
    bestTime,
  };
}

export function getDisciplineWindowStats(logs: PracticeLog[], mode: LogMode | "all" = "all", sizes = [5, 10, 20, 50]) {
  return DISCIPLINES.map((discipline) => ({
    discipline,
    windows: sizes.map((size) => calculateWindowStats(discipline, logs, size, mode)),
  }));
}

export function getRecentTrend(logs: PracticeLog[], days = 7, mode: LogMode | "all" = "all") {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days + 1);
  threshold.setHours(0, 0, 0, 0);
  const recent = filterLogsByMode(logs, mode).filter((log) => new Date(log.date) >= threshold);
  const attempts = recent.reduce((sum, log) => sum + log.attempts, 0);
  const successes = recent.reduce((sum, log) => sum + log.successes, 0);
  const successRate = attempts > 0 ? (successes / attempts) * 100 : 0;
  const bestDiscipline = getDisciplineStats(recent)
    .filter((item) => item.attempts > 0)
    .sort((a, b) => b.successRate - a.successRate)[0]?.discipline;

  return { attempts, successes, successRate, bestDiscipline, recent };
}

export function getWeaknessRanking(logs: PracticeLog[], mode: LogMode | "all" = "all") {
  return getDisciplineStats(logs, mode)
    .filter((item) => item.attempts > 0)
    .sort((a, b) => b.weaknessScore - a.weaknessScore);
}

export function getRecommendedDisciplines(logs: PracticeLog[]) {
  const weakness = getWeaknessRanking(logs);
  return weakness.length > 0 ? weakness.slice(0, 2).map((item) => item.discipline) : DISCIPLINES.slice(0, 2);
}

export function generatePracticeMenu(logs: PracticeLog[]): PracticeMenuItem[] {
  const stats = getDisciplineStats(logs);
  const recent = getRecentTrend(logs, 7).recent;
  const maxRecentAttempts = Math.max(1, ...DISCIPLINES.map((discipline) => recent.filter((log) => log.discipline === discipline).length));

  return stats
    .map((stat) => {
      const recentCount = recent.filter((log) => log.discipline === stat.discipline).length;
      const lowSuccessBonus = Math.max(0, (75 - stat.successRate) / 12);
      const weaknessBonus = Math.max(0, stat.weaknessScore / 35);
      const lowRecentBonus = Math.max(0, maxRecentAttempts - recentCount) * 0.8;
      const count = Math.max(3, Math.min(10, Math.round(3 + lowSuccessBonus + weaknessBonus + lowRecentBonus)));
      const reason =
        recentCount === 0
          ? "直近の練習回数が少ない"
          : stat.successRate < 70
            ? "成功率を戻したい"
            : "バランス維持";

      return { discipline: stat.discipline, count, reason };
    })
    .sort((a, b) => DISCIPLINES.indexOf(a.discipline) - DISCIPLINES.indexOf(b.discipline));
}

export function compareWithOpponent(logs: PracticeLog[], opponent?: Opponent) {
  const mine = getDisciplineStats(logs);
  if (!opponent) {
    return mine.map((stat) => ({ ...stat, opponentAverage: 0, opponentSuccessRate: 0, edge: 0 }));
  }

  return mine.map((stat) => {
    const opponentAverage = opponent.averages[stat.discipline];
    const opponentSuccessRate = opponent.successRates[stat.discipline];
    const speedEdge = opponentAverage - stat.averageTime;
    const accuracyEdge = stat.successRate - opponentSuccessRate;
    return { ...stat, opponentAverage, opponentSuccessRate, edge: speedEdge + accuracyEdge / 4 };
  });
}

export function buildMatchPlan(logs: PracticeLog[], opponent?: Opponent) {
  const comparison = compareWithOpponent(logs, opponent);
  const sorted = [...comparison].sort((a, b) => b.edge - a.edge);
  const targets = sorted.slice(0, 2).map((item) => item.discipline);
  const warnings = sorted.slice(-2).reverse().map((item) => item.discipline);
  const discardable = comparison
    .filter((item) => item.edge < -8 && item.successRate < 70)
    .slice(0, 2)
    .map((item) => item.discipline);
  const menu = [...new Set([...warnings, ...getRecommendedDisciplines(logs)])].slice(0, 3);

  return {
    comparison,
    targets,
    warnings,
    discardable,
    menu,
    winLine:
      targets.length > 0
        ? `${targets.join(" / ")}を優先し、${warnings[0] ?? "相手の得意種目"}は成功率を崩さない練習方針にします。`
        : "ログを追加して、自分が安定して取れる種目を見つけましょう。",
  };
}

export function getWeeklyReview(logs: PracticeLog[]) {
  const current = getRecentTrend(logs, 7);
  const previousThreshold = new Date();
  previousThreshold.setDate(previousThreshold.getDate() - 14);
  previousThreshold.setHours(0, 0, 0, 0);
  const lastWeekEnd = new Date();
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
  const previous = logs.map(normalizeStoredLog).filter((log) => new Date(log.date) >= previousThreshold && new Date(log.date) < lastWeekEnd);
  const currentStats = getDisciplineStats(current.recent);
  const previousStats = getDisciplineStats(previous);

  const improved = currentStats
    .map((stat) => {
      const before = previousStats.find((item) => item.discipline === stat.discipline);
      return { discipline: stat.discipline, delta: stat.successRate - (before?.successRate ?? 0), attempts: stat.attempts };
    })
    .filter((item) => item.attempts > 0)
    .sort((a, b) => b.delta - a.delta)[0]?.discipline;

  const worstFailure = currentStats
    .filter((item) => item.attempts > 0)
    .sort((a, b) => b.failures / Math.max(1, b.attempts) - a.failures / Math.max(1, a.attempts))[0]?.discipline;

  return {
    attempts: current.attempts,
    improved: improved ?? getRecommendedDisciplines(logs)[0],
    worstFailure: worstFailure ?? getRecommendedDisciplines(logs)[0],
    focus: getRecommendedDisciplines(logs),
  };
}

export function daysUntil(date: string) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export function getDisciplineTone(discipline: Discipline) {
  const tones: Record<Discipline, string> = {
    Cards: "bg-emerald-100 text-emerald-900 border-emerald-200",
    Images: "bg-amber-100 text-amber-950 border-amber-200",
    "International Names": "bg-cyan-100 text-cyan-950 border-cyan-200",
    Names: "bg-violet-100 text-violet-900 border-violet-200",
    Numbers: "bg-sky-100 text-sky-900 border-sky-200",
    Words: "bg-rose-100 text-rose-900 border-rose-200",
  };
  return tones[discipline];
}

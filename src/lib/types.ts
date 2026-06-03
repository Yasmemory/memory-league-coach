export const EVENT_ORDER = [
  "Cards",
  "Images",
  "International Names",
  "Names",
  "Numbers",
  "Words",
] as const;

export const DISCIPLINES = EVENT_ORDER;

export type Discipline = (typeof DISCIPLINES)[number];

export const LOG_MODES = ["train", "rated", "official"] as const;

export type LogMode = (typeof LOG_MODES)[number];

export type PracticeLog = {
  id: string;
  date: string;
  discipline: Discipline;
  mode?: LogMode;
  score?: number;
  time?: number;
  attempts: number;
  successes: number;
  failures: number;
  averageRecord: number;
  bestRecord: number;
  memo: string;
};

export type DisciplineStats = {
  discipline: Discipline;
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
  averageRecord: number;
  bestRecord: number;
  averageScore: number;
  averageTime: number;
  bestScore: number;
  bestTime: number;
  stability: number;
  weaknessScore: number;
};

export type Opponent = {
  id: string;
  name: string;
  averages: Record<Discipline, number>;
  successRates: Record<Discipline, number>;
  memo: string;
};

export type Settings = {
  tournamentName?: string;
  tournamentDate: string;
  nextOpponentId: string;
  playerName: string;
};

export type CoachData = {
  logs: PracticeLog[];
  opponents: Opponent[];
  settings: Settings;
};

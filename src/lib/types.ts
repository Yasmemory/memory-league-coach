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

export const DISCIPLINE_COLORS: Record<Discipline, string> = {
  Cards: "#DB2828",
  Images: "#FBBD08",
  "International Names": "#A6CC18",
  Names: "#21BA45",
  Numbers: "#1F85D0",
  Words: "#A333C8",
};

export const LOG_MODES = ["train", "rated", "official"] as const;

export type LogMode = (typeof LOG_MODES)[number];

export const OFFICIAL_ROUNDS = ["GL", "Qualifier", "R16", "QF", "SF", "F"] as const;

export type OfficialRound = (typeof OFFICIAL_ROUNDS)[number];

export type MatchResult = "win" | "loss";

export type PracticeLog = {
  id: string;
  date: string;
  discipline: Discipline;
  mode?: LogMode;
  officialTournamentId?: string;
  officialRound?: string;
  opponentName?: string;
  result?: MatchResult;
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

export type Tournament = {
  id: string;
  name: string;
  date: string;
  goal?: string;
  memo?: string;
};

export type OfficialTournament = {
  id: string;
  name: string;
  date: string;
  memo?: string;
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
  tournaments?: Tournament[];
  officialTournaments?: OfficialTournament[];
  settings: Settings;
};

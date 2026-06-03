import { normalizeMemoryLeagueLog } from "@/app/shared";
import { CoachData, DISCIPLINES, Opponent, PracticeLog } from "./types";

const today = new Date();
const isoDaysAgo = (days: number) => {
  const date = new Date(today);
  date.setDate(today.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export const sampleLogs: PracticeLog[] = [
  ["Cards", "train", 0, 8, 52, 27.8, "入りは良い。想起で1ミス。"],
  ["Numbers", "rated", 1, 7, 48, 82.5, "ペースを落とすと安定。"],
  ["Images", "official", 2, 6, 63, 47.2, "連想の質は良い。"],
  ["Words", "train", 3, 5, 0, 61.4, "抽象語で崩れた。"],
  ["Names", "rated", 4, 6, 21, 72.1, "顔と名前の接続を整理する。"],
  ["International Names", "official", 5, 5, 18, 88.7, "読み始めの速度が課題。"],
  ["Cards", "rated", 6, 10, 52, 26.9, "短期戦向けに好調。"],
  ["Numbers", "train", 7, 8, 46, 79.4, "落ち着くと正確。"],
  ["Images", "rated", 8, 6, 61, 49.9, "2本目で集中が落ちた。"],
  ["Words", "official", 9, 4, 38, 65.7, "復習量を増やす。"],
  ["Names", "train", 10, 5, 28, 69.8, "名前変換は改善傾向。"],
  ["International Names", "rated", 11, 4, 0, 94.3, "試合前は短く反復。"],
].map(([discipline, mode, daysAgo, attempts, score, time, memo], index) => ({
  id: `sample-log-${index + 1}`,
  ...normalizeMemoryLeagueLog({
    date: isoDaysAgo(Number(daysAgo)),
    discipline: discipline as PracticeLog["discipline"],
    mode: mode as PracticeLog["mode"],
    score: Number(score),
    time: Number(time),
    memo: String(memo),
  }),
  attempts: Number(attempts),
  successes: Number(score) > 0 ? Number(attempts) - Math.floor(Number(attempts) / 4) : 0,
  failures: Number(score) > 0 ? Math.floor(Number(attempts) / 4) : Number(attempts),
}));

const rates = (base: number) =>
  Object.fromEntries(DISCIPLINES.map((discipline, index) => [discipline, Math.max(45, base - index * 4)])) as Opponent["successRates"];

export const sampleOpponents: Opponent[] = [
  {
    id: "opponent-aoi",
    name: "Aoi Tanaka",
    averages: {
      Cards: 25.9,
      Numbers: 77.2,
      Images: 46.5,
      Words: 63.1,
      Names: 67.4,
      "International Names": 84.8,
    },
    successRates: rates(82),
    memo: "CardsとImagesが強い。Namesはプレッシャーで崩れることがある。",
  },
  {
    id: "opponent-ren",
    name: "Ren Sato",
    averages: {
      Cards: 29.8,
      Numbers: 73.8,
      Images: 52.4,
      Words: 59.5,
      Names: 71.9,
      "International Names": 90.2,
    },
    successRates: rates(76),
    memo: "Numbersが速い。Wordsは無理に取りに行きすぎない。",
  },
];

export const sampleData: CoachData = {
  logs: sampleLogs,
  opponents: sampleOpponents,
  settings: {
    tournamentDate: isoDaysAgo(-21),
    nextOpponentId: "opponent-aoi",
    playerName: "You",
  },
};

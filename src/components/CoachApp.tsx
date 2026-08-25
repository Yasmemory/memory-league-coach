"use client";

import Link from "next/link";
import Image from "next/image";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  buildMatchPlan,
  calculateEventStats,
  daysUntil,
  generatePracticeMenu,
  getAnalyticsFilterState,
  getAvailableMonths,
  getDisciplineStats,
  getDisciplineWindowStats,
  getRecentTrend,
  getWeeklyReview,
  percent,
  formatTime,
  record,
} from "@/lib/analytics";
import { sampleData } from "@/lib/sample-data";
import { CoachData, Discipline, DISCIPLINE_COLORS, DISCIPLINES, LOG_MODES, LogMode, OFFICIAL_ROUNDS, OfficialTournament, Opponent, PracticeLog, Route, SELF_RATINGS, SELF_RATING_SYMBOLS, SelfRating, Tournament } from "@/lib/types";
import {
  deletePracticeLog,
  filterLogsByOfficialTournament,
  getModeBadgeStyle,
  getModeLabel,
  getOfficialTournamentName,
  isSuccessfulLog,
  normalizeMemoryLeagueLog,
  normalizeStoredLog,
  parseMemoryLeagueImportText,
  getNextTournament,
  extractPlayerLogFromMatch,
  normalizeMatchImportLog,
  parseMatchResultText,
  updatePracticeLogInline,
} from "@/app/shared";
import { createPracticeLogInApi, fetchPracticeLogsFromApi, readPracticeLogApiError, updatePracticeLogSelfRatingInApi, type PracticeLogRequest, type PracticeLogResponse as DbPracticeLogResponse } from "@/lib/practice-log-api";
import { filterLogsByRoute, filterLogsBySelfRating, getRouteAnalysis, getSelfRatingBreakdown, type AnalyticsRouteFilter, type AnalyticsSelfRatingFilter } from "@/lib/analytics-route-rating";
import { createOpponentInApi, deleteOpponentInApi, fetchOpponentsFromApi, updateOpponentInApi } from "@/lib/opponent-api";
import {
  createOfficialTournamentInApi,
  createTournamentInApi,
  deleteOfficialTournamentInApi,
  deleteTournamentInApi,
  fetchOfficialTournamentsFromApi,
  fetchTournamentsFromApi,
  updateOfficialTournamentInApi,
  updateTournamentInApi,
} from "@/lib/tournament-api";
import { ROUTE_DISCIPLINES, routeIdForDiscipline, routesForDiscipline, sortRoutesForSettings, type RouteDiscipline, type RouteInput } from "@/lib/route-api";
import { useRoutes } from "@/hooks/use-routes";

type View = "dashboard" | "practice" | "analytics" | "opponents" | "match-plan" | "weekly-review" | "settings" | "import";
type NumberInputValue = number | "";
type EventFilter = Discipline | "all";
type PeriodFilter = "all" | "7" | "30" | "90" | "custom" | `month:${string}`;
type ThemeMode = "light" | "dark";
type Language = "ja" | "en";
type RouteFormState = RouteInput;
type PracticeLogFormState = {
  date: string;
  discipline: Discipline;
  mode: LogMode;
  officialTournamentId?: string;
  officialRound?: string;
  opponentName?: string;
  score: NumberInputValue;
  time: NumberInputValue;
  memo: string;
  routeId?: string | null;
  selfRating?: SelfRating | null;
};
type OpponentFormState = {
  name: string;
  averages: Record<Discipline, NumberInputValue>;
  successRates: Record<Discipline, NumberInputValue>;
  memo: string;
};
const storageKey = "memory-league-coach:data:v1";
const uiStorageKey = "memory-league-coach:ui:v1";
const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function practiceLogFromDb(log: DbPracticeLogResponse): PracticeLog {
  return normalizeStoredLog({
    id: log.id,
    date: log.date,
    discipline: log.discipline,
    mode: log.mode,
    officialTournamentId: log.officialTournamentId ?? undefined,
    officialRound: log.officialRound ?? undefined,
    opponentName: log.opponentName ?? undefined,
    result: log.result ?? undefined,
    source: log.source,
    score: log.score ?? undefined,
    time: log.time ?? undefined,
    attempts: 1,
    successes: Number(log.score ?? 0) >= 1 ? 1 : 0,
    failures: Number(log.score ?? 0) >= 1 ? 0 : 1,
    averageRecord: log.time ?? 0,
    bestRecord: log.time ?? 0,
    memo: log.memo ?? "",
    routeId: log.routeId ?? null,
    selfRating: log.selfRating ?? null,
    route: log.route ?? null,
  });
}

function practiceLogToDbPayload(log: Omit<PracticeLog, "id"> | PracticeLog): PracticeLogRequest {
  return {
    date: log.date,
    discipline: log.discipline,
    mode: log.mode ?? "train",
    score: log.score ?? null,
    time: log.time ?? null,
    result: log.result ?? null,
    opponentName: log.opponentName ?? null,
    officialTournamentId: log.officialTournamentId ?? null,
    officialRound: log.officialRound ?? null,
    memo: log.memo ?? null,
    source: log.source ?? "manual",
    routeId: log.routeId ?? null,
    selfRating: log.selfRating ?? null,
  };
}

async function parseApiError(response: Response, fallback: string) {
  return readPracticeLogApiError(response, fallback);
}

function usePracticeLogs() {
  const [logs, setLogs] = useState<PracticeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const dbLogs = await fetchPracticeLogsFromApi("DBログの取得に失敗しました。");
      setLogs(dbLogs.map(practiceLogFromDb));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "DBログの取得に失敗しました。";
      setError(message);
      throw loadError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {
        // The hook exposes the error state to the active page.
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const createLog = async (log: Omit<PracticeLog, "id">) => {
    setError("");
    try {
      const saved = practiceLogFromDb(await createPracticeLogInApi(practiceLogToDbPayload(log), "ログの保存に失敗しました。"));
      setLogs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      return saved;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "ログの保存に失敗しました。";
      setError(message);
      throw saveError;
    }
  };

  const updateLog = async (log: PracticeLog) => {
    setError("");
    try {
      const response = await fetch(`/api/practice-logs/${encodeURIComponent(log.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(practiceLogToDbPayload(log)),
      });
      if (!response.ok) throw new Error(await parseApiError(response, "ログの更新に失敗しました。"));
      const saved = practiceLogFromDb((await response.json()) as DbPracticeLogResponse);
      setLogs((current) => updatePracticeLogInline(current, saved));
      return saved;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "ログの更新に失敗しました。";
      setError(message);
      throw saveError;
    }
  };

  const deleteLog = async (id: string) => {
    setError("");
    try {
      const response = await fetch(`/api/practice-logs/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await parseApiError(response, "ログの削除に失敗しました。"));
      setLogs((current) => deletePracticeLog(current, id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "ログの削除に失敗しました。";
      setError(message);
      throw deleteError;
    }
  };

  const updateSelfRating = async (id: string, selfRating: SelfRating | null) => {
    try {
      const saved = practiceLogFromDb(await updatePracticeLogSelfRatingInApi(id, selfRating));
      setLogs((current) => updatePracticeLogInline(current, saved));
      return saved;
    } catch (saveError) {
      throw saveError;
    }
  };

  return { logs, loading, error, refresh, createLog, updateLog, deleteLog, updateSelfRating };
}

function useTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setTournaments(await fetchTournamentsFromApi());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "大会の取得に失敗しました。";
      setError(message);
      throw loadError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const create = async (tournament: Omit<Tournament, "id">) => {
    const saved = await createTournamentInApi(tournament);
    setTournaments((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return saved;
  };

  const update = async (id: string, tournament: Omit<Tournament, "id">) => {
    const saved = await updateTournamentInApi(id, tournament);
    setTournaments((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    return saved;
  };

  const remove = async (id: string) => {
    await deleteTournamentInApi(id);
    setTournaments((current) => current.filter((item) => item.id !== id));
  };

  return { tournaments, loading, error, refresh, create, update, remove };
}

function useOfficialTournaments() {
  const [officialTournaments, setOfficialTournaments] = useState<OfficialTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setOfficialTournaments(await fetchOfficialTournamentsFromApi());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Official大会の取得に失敗しました。";
      setError(message);
      throw loadError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const create = async (tournament: Omit<OfficialTournament, "id">) => {
    const saved = await createOfficialTournamentInApi(tournament);
    setOfficialTournaments((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return saved;
  };

  const update = async (id: string, tournament: Omit<OfficialTournament, "id">) => {
    const saved = await updateOfficialTournamentInApi(id, tournament);
    setOfficialTournaments((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    return saved;
  };

  const remove = async (id: string) => {
    await deleteOfficialTournamentInApi(id);
    setOfficialTournaments((current) => current.filter((item) => item.id !== id));
  };

  return { officialTournaments, loading, error, refresh, create, update, remove };
}

function useOpponents() {
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setOpponents(await fetchOpponentsFromApi());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "対戦相手の取得に失敗しました。";
      setError(message);
      throw loadError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const create = async (opponent: Omit<Opponent, "id">) => {
    const saved = await createOpponentInApi(opponent);
    setOpponents((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return saved;
  };

  const update = async (id: string, opponent: Omit<Opponent, "id">) => {
    const saved = await updateOpponentInApi(id, opponent);
    setOpponents((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    return saved;
  };

  const remove = async (id: string) => {
    await deleteOpponentInApi(id);
    setOpponents((current) => current.filter((item) => item.id !== id));
  };

  return { opponents, loading, error, refresh, create, update, remove };
}

const navItems: { href: string; labelKey: TranslationKey; view: View }[] = [
  { href: "/dashboard", labelKey: "dashboard", view: "dashboard" },
  { href: "/practice", labelKey: "practiceInput", view: "practice" },
  { href: "/import", labelKey: "import", view: "import" },
  { href: "/analytics", labelKey: "analytics", view: "analytics" },
  { href: "/opponents", labelKey: "opponents", view: "opponents" },
  { href: "/match-plan", labelKey: "matchPlan", view: "match-plan" },
  { href: "/weekly-review", labelKey: "weeklyReview", view: "weekly-review" },
  { href: "/settings", labelKey: "settings", view: "settings" },
];

const translations = {
  ja: {
    dashboard: "ダッシュボード",
    practiceInput: "ログ入力",
    import: "インポート",
    analytics: "分析",
    opponents: "対戦相手",
    matchPlan: "対戦プラン",
    weeklyReview: "週次レビュー",
    settings: "設定",
    recent7Days: "直近7日",
    todayPracticeMenu: "今日の練習メニュー",
    tournaments: "大会一覧",
    noUpcomingTournaments: "未来の大会が登録されていません。",
    recentTrend: "直近の調子",
    nextOpponent: "次の対戦相手",
    unset: "未設定",
    todayTotal: "今日の合計",
    recentRecords: "最近の記録",
    filters: "フィルタ",
    allDisciplines: "全種目",
    discipline: "種目",
    period: "期間",
    allPeriod: "全期間",
    custom: "カスタム",
    startDate: "開始日",
    endDate: "終了日",
    mode: "モード",
    noLogsInPeriod: "この期間のログがありません。",
    eventAnalysis: "各種目分析",
    allLogs: "全ログ一覧",
    logList: "ログ一覧",
    practiceLogs: "練習ログ",
    date: "日付",
    judgment: "判定",
    memo: "メモ",
    officialTournament: "Official大会",
    officialTournamentRecords: "大会記録用大会",
    officialTournamentAdd: "Official大会を追加",
    officialTournamentEdit: "Official大会を編集",
    officialTournamentUnset: "大会未設定",
    officialTournamentRegisterHint: "設定ページで大会を登録してください。",
    officialTournamentAll: "Official 全体",
    officialRound: "ラウンド",
    opponentName: "対戦相手",
    actions: "操作",
    save: "保存",
    delete: "削除",
    edit: "修正",
    cancel: "キャンセル",
    score: "スコア",
    time: "タイム",
    addRecord: "追加",
    playerName: "選手名",
    opponentInput: "対戦相手入力",
    addOpponent: "対戦相手を追加",
    targetDisciplines: "取りに行く種目",
    warningDisciplines: "警戒する種目",
    lowerPriority: "優先度を下げる種目",
    preMatchMenu: "試合前メニュー",
    practicePolicy: "練習方針",
    disciplineComparison: "種目別比較",
    weeklyAttempts: "今週の回数",
    mostImproved: "最も改善した種目",
    highFailure: "失敗率が高い種目",
    nextWeekFocus: "来週の重点種目",
    nextWeekPolicy: "来週の練習方針",
    tournamentAdd: "大会を追加",
    tournamentEdit: "大会を編集",
    tournamentName: "大会名",
    tournamentDate: "大会日",
    goal: "目標",
    basicSettings: "基本設定",
    nextOpponentSetting: "次の対戦相手",
    data: "データ",
    resetSample: "端末設定を初期化",
    successRate: "成功率",
    averageTime: "平均タイム",
    averageScore: "平均スコア",
    stability: "安定度",
    bestScore: "ベストスコア",
    bestTime: "ベストタイム",
    attempts: "練習回数",
    insufficientData: "データ不足",
    light: "ライト",
    dark: "ダーク",
    japanese: "日本語",
    english: "English",
    displaySettings: "表示設定",
    themeSetting: "テーマ",
    languageSetting: "言語",
    routeManagement: "ルート管理",
    addRoute: "ルートを追加",
    routeName: "ルート名",
    noRoutes: "ルートが登録されていません。",
    loadingRoutes: "読み込み中...",
    route: "ルート",
    none: "未選択",
    selfRating: "自己評価",
    notRated: "未評価",
    routeLoadFailed: "ルート一覧の取得に失敗しました。",
    all: "すべて",
    unassigned: "未設定",
    routeAnalysis: "ルート別分析",
    selfRatingBreakdown: "自己評価の内訳",
    logsCount: "件",
  },
  en: {
    dashboard: "Dashboard",
    practiceInput: "Log Input",
    import: "Import",
    analytics: "Analytics",
    opponents: "Opponents",
    matchPlan: "Match Plan",
    weeklyReview: "Weekly Review",
    settings: "Settings",
    recent7Days: "Last 7 Days",
    todayPracticeMenu: "Today's Practice Menu",
    tournaments: "Tournaments",
    noUpcomingTournaments: "No upcoming tournaments are registered.",
    recentTrend: "Recent Trend",
    nextOpponent: "Next Opponent",
    unset: "Not Set",
    todayTotal: "Today's Total",
    recentRecords: "Recent Records",
    filters: "Filters",
    allDisciplines: "All Disciplines",
    discipline: "Discipline",
    period: "Period",
    allPeriod: "All Time",
    custom: "Custom",
    startDate: "Start Date",
    endDate: "End Date",
    mode: "Mode",
    noLogsInPeriod: "No logs in this period.",
    eventAnalysis: "Discipline Analysis",
    allLogs: "All Logs",
    logList: "Logs",
    practiceLogs: "Practice Logs",
    date: "Date",
    judgment: "Result",
    memo: "Memo",
    officialTournament: "Official Tournament",
    officialTournamentRecords: "Official Tournaments",
    officialTournamentAdd: "Add Official Tournament",
    officialTournamentEdit: "Edit Official Tournament",
    officialTournamentUnset: "Tournament Not Set",
    officialTournamentRegisterHint: "Register a tournament in Settings.",
    officialTournamentAll: "All Official",
    officialRound: "Round",
    opponentName: "Opponent",
    actions: "Actions",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    cancel: "Cancel",
    score: "Score",
    time: "Time",
    addRecord: "Add",
    playerName: "Player Name",
    opponentInput: "Opponent Input",
    addOpponent: "Add Opponent",
    targetDisciplines: "Target Events",
    warningDisciplines: "Watch Events",
    lowerPriority: "Lower Priority",
    preMatchMenu: "Pre-match Menu",
    practicePolicy: "Practice Policy",
    disciplineComparison: "Discipline Comparison",
    weeklyAttempts: "Weekly Attempts",
    mostImproved: "Most Improved",
    highFailure: "Highest Failure Rate",
    nextWeekFocus: "Next Week Focus",
    nextWeekPolicy: "Next Week Plan",
    tournamentAdd: "Add Tournament",
    tournamentEdit: "Edit Tournament",
    tournamentName: "Tournament Name",
    tournamentDate: "Tournament Date",
    goal: "Goal",
    basicSettings: "Basic Settings",
    nextOpponentSetting: "Next Opponent",
    data: "Data",
    resetSample: "Reset Local Settings",
    successRate: "Success Rate",
    averageTime: "Average Time",
    averageScore: "Average Score",
    stability: "Stability",
    bestScore: "Best Score",
    bestTime: "Best Time",
    attempts: "Attempts",
    insufficientData: "Not Enough Data",
    light: "Light",
    dark: "Dark",
    japanese: "日本語",
    english: "English",
    displaySettings: "Display Settings",
    themeSetting: "Theme",
    languageSetting: "Language",
    routeManagement: "Route Management",
    addRoute: "Add Route",
    routeName: "Route Name",
    noRoutes: "No routes registered.",
    loadingRoutes: "Loading...",
    route: "Route",
    none: "None",
    selfRating: "Self rating",
    notRated: "Not rated",
    routeLoadFailed: "Failed to load routes.",
    all: "All",
    unassigned: "Unassigned",
    routeAnalysis: "Route analysis",
    selfRatingBreakdown: "Self rating breakdown",
    logsCount: "logs",
  },
} as const;

type TranslationKey = keyof typeof translations.ja;
type Translator = (key: TranslationKey) => string;
const I18nContext = createContext<Translator>((key) => translations.ja[key]);
const useT = () => useContext(I18nContext);

const emptyLog = (): PracticeLogFormState => ({
  date: todayIso(),
  discipline: "Cards",
  mode: "train",
  score: "",
  time: "",
  memo: "",
});

const emptyOpponent = (): OpponentFormState => ({
  name: "",
  averages: { Cards: "", Images: "", "International Names": "", Names: "", Numbers: "", Words: "" },
  successRates: { Cards: "", Images: "", "International Names": "", Names: "", Numbers: "", Words: "" },
  memo: "",
});

const emptyTournament = (): Omit<Tournament, "id"> => ({
  name: "",
  date: todayIso(),
  goal: "",
  memo: "",
});

const emptyOfficialTournament = (): Omit<OfficialTournament, "id"> => ({
  name: "",
  date: todayIso(),
  memo: "",
});

const emptyRoute = (): RouteFormState => ({
  discipline: "Cards",
  name: "",
  memo: "",
});

const emptyCoachData = (): CoachData => ({
  logs: [],
  opponents: [],
  tournaments: [],
  officialTournaments: [],
  settings: sampleData.settings,
});

function useCoachData() {
  const [data, setData] = useState<CoachData>(emptyCoachData);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let nextData = emptyCoachData();
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<CoachData>;
        nextData = {
          ...emptyCoachData(),
          settings: { ...sampleData.settings, ...parsed.settings },
        };
      } catch {
        nextData = emptyCoachData();
      }
    }
    const timer = window.setTimeout(() => {
      setData(nextData);
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ settings: data.settings }));
  }, [data, mounted]);

  return { data, setData, mounted };
}

function useUiPreferences() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [language, setLanguage] = useState<Language>("ja");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let nextTheme: ThemeMode = "light";
    let nextLanguage: Language = "ja";
    try {
      const saved = window.localStorage.getItem(uiStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { theme?: ThemeMode; language?: Language };
        if (parsed.theme === "light" || parsed.theme === "dark") nextTheme = parsed.theme;
        if (parsed.language === "ja" || parsed.language === "en") nextLanguage = parsed.language;
      }
    } catch {
      // Keep defaults when preferences are unreadable.
    }
    const timer = window.setTimeout(() => {
      setTheme(nextTheme);
      setLanguage(nextLanguage);
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    if (!mounted) return;
    window.localStorage.setItem(uiStorageKey, JSON.stringify({ theme, language }));
  }, [language, mounted, theme]);

  return { theme, setTheme, language, setLanguage };
}

export function CoachApp({ view }: { view: View }) {
  const { data, setData, mounted } = useCoachData();
  const { theme, setTheme, language, setLanguage } = useUiPreferences();
  const practiceLogs = usePracticeLogs();
  const tournamentsState = useTournaments();
  const officialTournamentsState = useOfficialTournaments();
  const opponentsState = useOpponents();
  const routesState = useRoutes();
  const t = useMemo<Translator>(() => (key) => translations[language][key] ?? translations.ja[key], [language]);
  const trend = useMemo(() => getRecentTrend(practiceLogs.logs), [practiceLogs.logs]);
  const nextOpponent = opponentsState.opponents.find((opponent) => opponent.id === data.settings.nextOpponentId) ?? opponentsState.opponents[0];

  const normalizedData = { ...data, logs: practiceLogs.logs, tournaments: tournamentsState.tournaments, officialTournaments: officialTournamentsState.officialTournaments, opponents: opponentsState.opponents };
  const content = {
    dashboard: <Dashboard data={normalizedData} opponent={nextOpponent} practiceLogs={practiceLogs} tournamentsState={tournamentsState} routesState={routesState} />,
    practice: <Practice officialTournaments={officialTournamentsState.officialTournaments} officialTournamentsLoading={officialTournamentsState.loading} practiceLogs={practiceLogs} routesState={routesState} />,
    import: <ImportPage officialTournaments={officialTournamentsState.officialTournaments} onSaved={practiceLogs.refresh} />,
    analytics: <Analytics officialTournaments={officialTournamentsState.officialTournaments} practiceLogs={practiceLogs} routesState={routesState} />,
    opponents: <Opponents opponentsState={opponentsState} />,
    "match-plan": <MatchPlan data={normalizedData} setData={setData} opponentsState={opponentsState} />,
    "weekly-review": <WeeklyReview practiceLogs={practiceLogs} />,
    settings: <SettingsView data={normalizedData} setData={setData} tournamentsState={tournamentsState} officialTournamentsState={officialTournamentsState} opponentsState={opponentsState} routesState={routesState} refreshPracticeLogs={practiceLogs.refresh} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} />,
  }[view];

  return (
    <I18nContext.Provider value={t}>
    <div className={`min-h-screen bg-stone-50 text-zinc-950 ${theme === "dark" ? "theme-dark dark" : "theme-light"}`}>
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black p-1">
                <Image src="/memory-sports-analytics-logo.png" alt="Memory Sports Analytics" width={44} height={44} className="h-full w-full object-contain" priority />
              </span>
              <span className="min-w-0 text-base font-bold leading-tight sm:text-lg">Memory Sports Analytics</span>
            </Link>
            <div className="hidden rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-xs text-zinc-600 sm:block">
              {t("recent7Days")} <span className="font-semibold text-zinc-950">{mounted && !practiceLogs.loading ? `${trend.attempts}回` : "--"}</span>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${view === item.view ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}>
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{content}</main>
    </div>
    </I18nContext.Provider>
  );
}

function Dashboard({ data, opponent, practiceLogs, tournamentsState, routesState }: { data: CoachData; opponent?: Opponent; practiceLogs: ReturnType<typeof usePracticeLogs>; tournamentsState: ReturnType<typeof useTournaments>; routesState: ReturnType<typeof useRoutes> }) {
  const t = useT();
  const [notice, setNotice] = useState("");
  const { logs, loading, error } = practiceLogs;

  const addLog = async (log: Omit<PracticeLog, "id">) => {
    setNotice("");
    try {
      await practiceLogs.createLog(log);
      setNotice("保存しました。");
      return true;
    } catch {
      return false;
    }
  };

  const nextTournament = getNextTournament(data.tournaments ?? []);
  const stats = useMemo(() => getDisciplineStats(logs), [logs]);
  const trend = useMemo(() => getRecentTrend(logs), [logs]);
  const practiceMenu = useMemo(() => generatePracticeMenu(logs), [logs]);
  const latest = useMemo(() => logs.slice(0, 5), [logs]);
  const upcomingTournaments = sortTournaments(data.tournaments ?? []).filter((tournament) => {
    const remaining = daysUntil(tournament.date);
    return remaining === null || remaining >= 0;
  });

  return (
    <Page title={t("dashboard")} subtitle="">
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Panel title={t("todayPracticeMenu")}>
          {loading ? <p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p> : <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {practiceMenu.map((item) => (
              <div key={item.discipline} className="rounded-lg border bg-white p-3" style={getDisciplineCardStyle(item.discipline)}>
                <DisciplineBadge discipline={item.discipline} />
                <div className="mt-1 text-2xl font-black">{item.count}回</div>
                <p className="mt-1 text-xs leading-5 text-zinc-700">{item.reason}</p>
              </div>
            ))}
          </div>}
        </Panel>
        <Panel title={t("tournaments")}>
          {tournamentsState.loading ? <p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p> : tournamentsState.error ? <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">{tournamentsState.error}</p> : upcomingTournaments.length === 0 ? <p className="text-sm text-zinc-600">{t("noUpcomingTournaments")}</p> : <TournamentList tournaments={upcomingTournaments} nextTournamentId={nextTournament?.id} />}
        </Panel>
      </div>
      <Panel title={t("practiceInput")}><DailyLogForm officialTournaments={data.officialTournaments ?? []} routesState={routesState} onAdd={addLog} /></Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Metric label={t("recentTrend")} value={loading ? "--" : `${trend.attempts}回`} detail={loading ? t("recent7Days") : `${trend.successes}成功 / ${t("recent7Days")}`} />
        <Metric label={t("nextOpponent")} value={opponent?.name ?? t("unset")} detail={t("matchPlan")} />
        <Metric label={t("todayTotal")} value={loading ? "--" : `${practiceMenu.reduce((sum, item) => sum + item.count, 0)}回`} detail={t("todayPracticeMenu")} />
      </div>
      <Panel title={t("recentRecords")}>{loading ? <p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p> : <LogList logs={latest} officialTournaments={data.officialTournaments ?? []} />}</Panel>
      <Panel title={t("analytics")}>{loading ? <p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p> : <StatsGrid stats={stats} />}</Panel>
    </Page>
  );
}

function sortTournaments(tournaments: Tournament[]) {
  return tournaments.slice().sort((a, b) => {
    const aDays = daysUntil(a.date);
    const bDays = daysUntil(b.date);
    const aPast = aDays !== null && aDays < 0;
    const bPast = bDays !== null && bDays < 0;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function TournamentList({ tournaments, nextTournamentId }: { tournaments: Tournament[]; nextTournamentId?: string }) {
  return (
    <div className="grid gap-3">
      {tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} isNext={tournament.id === nextTournamentId} />)}
    </div>
  );
}

function TournamentCard({ tournament, isNext }: { tournament: Tournament; isNext: boolean }) {
  const remaining = daysUntil(tournament.date);
  const finished = remaining !== null && remaining < 0;
  return (
    <article className={`tournament-card ${isNext ? "tournament-card-next" : ""} rounded-lg border p-4 ${isNext ? "border-zinc-950 bg-zinc-950 text-white" : finished ? "border-zinc-200 bg-zinc-50 text-zinc-500" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">{tournament.name || "大会"}</div>
          <div className={`tournament-card-date mt-1 text-sm ${isNext ? "text-zinc-200" : "text-zinc-500"}`}>{formatDisplayDate(tournament.date)}</div>
        </div>
        <span className={`tournament-card-days rounded-md px-2 py-1 text-xs font-bold ${isNext ? "bg-white text-zinc-950" : finished ? "bg-zinc-200 text-zinc-600" : "bg-zinc-100 text-zinc-700"}`}>
          {finished ? "終了済み" : remaining === null ? "-" : `あと${remaining}日`}
        </span>
      </div>
      {tournament.goal && <p className={`mt-3 text-sm font-semibold ${isNext ? "text-white" : "text-zinc-800"}`}>目標: {tournament.goal}</p>}
      {tournament.memo && <p className={`mt-2 text-sm ${isNext ? "text-zinc-200" : "text-zinc-600"}`}>{tournament.memo}</p>}
    </article>
  );
}

function Practice({ officialTournaments, officialTournamentsLoading, practiceLogs, routesState }: { officialTournaments: OfficialTournament[]; officialTournamentsLoading: boolean; practiceLogs: ReturnType<typeof usePracticeLogs>; routesState: ReturnType<typeof useRoutes> }) {
  const t = useT();
  const [notice, setNotice] = useState("");
  const { logs, loading, error } = practiceLogs;

  const addLog = async (log: Omit<PracticeLog, "id">) => {
    setNotice("");
    try {
      await practiceLogs.createLog(log);
      setNotice("保存しました。");
      return true;
    } catch {
      return false;
    }
  };

  const updateLog = async (log: PracticeLog) => {
    setNotice("");
    try {
      await practiceLogs.updateLog(log);
      setNotice("保存しました。");
      return true;
    } catch {
      return false;
    }
  };

  const deleteLog = async (id: string) => {
    setNotice("");
    try {
      await practiceLogs.deleteLog(id);
      setNotice("削除しました。");
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Page title={t("practiceInput")} subtitle="">
      <Panel title={t("practiceInput")}><DailyLogForm officialTournaments={officialTournaments} officialTournamentsLoading={officialTournamentsLoading} routesState={routesState} onAdd={addLog} /></Panel>
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {loading ? <Panel title={t("recentRecords")}><p className="text-sm text-zinc-600">読み込み中...</p></Panel> : <EditableLogsTable logs={logs} officialTournaments={officialTournaments} routesState={routesState} onUpdate={updateLog} onDelete={deleteLog} />}
    </Page>
  );
}

function DailyLogForm({ officialTournaments, officialTournamentsLoading = false, routesState, onAdd }: { officialTournaments: OfficialTournament[]; officialTournamentsLoading?: boolean; routesState: ReturnType<typeof useRoutes>; onAdd: (log: Omit<PracticeLog, "id">) => boolean | Promise<boolean> }) {
  const t = useT();
  const [form, setForm] = useState<PracticeLogFormState>(emptyLog);
  const routeSupported = ROUTE_DISCIPLINES.includes(form.discipline as RouteDiscipline);
  const routeOptions = routesForDiscipline(routesState.routes, form.discipline);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await onAdd(normalizeMemoryLeagueLog({ ...form, score: form.score === "" ? undefined : form.score, time: form.time === "" ? undefined : form.time }));
    if (ok) setForm(emptyLog());
  };
  const scoreField = <NumberField label={t("score")} value={form.score} onChange={(score) => setForm({ ...form, score })} placeholder="例: 52" />;
  const timeField = <NumberField label={t("time")} value={form.time} onChange={(time) => setForm({ ...form, time })} placeholder="例: 48.07" step="0.01" />;

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label={t("date")} className="sm:max-w-[180px]"><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
      <div className="grid gap-4 xl:grid-cols-[minmax(36rem,1.55fr)_minmax(14rem,0.65fr)_minmax(6.5rem,0.38fr)_minmax(6.5rem,0.38fr)] xl:items-end">
        <div>
          <div className="mb-2 text-sm font-medium text-zinc-700">{t("discipline")}</div>
          <div className="flex flex-wrap gap-2">
            {DISCIPLINES.map((discipline) => <button key={discipline} type="button" title={discipline} onClick={() => setForm({ ...form, discipline, routeId: routeIdForDiscipline(form.routeId, discipline, routesState.routes) })} className={`rounded-md border px-3 py-2 text-sm font-black transition ${form.discipline === discipline ? "ring-2 ring-zinc-950 ring-offset-1" : "hover:bg-zinc-50"}`} style={getDisciplineBadgeStyle(discipline)}><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: DISCIPLINE_COLORS[discipline] }} />{discipline === "International Names" ? "IN" : discipline}</span></button>)}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-zinc-700">Mode</div>
          <div className="flex flex-wrap gap-2">
            {LOG_MODES.map((mode) => <button key={mode} type="button" onClick={() => setForm({ ...form, mode })} className={`min-h-11 rounded-md border px-4 py-2 text-sm font-bold transition ${form.mode === mode ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{getModeLabel(mode)}</button>)}
          </div>
        </div>
        {form.mode === "train" ? <>{scoreField}{timeField}</> : <>{timeField}{scoreField}</>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {routeSupported && (
          <Field label={t("route")}>
            {routesState.loading ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{t("loadingRoutes")}</div>
            ) : (
              <div className="grid gap-1">
                <select className="input" value={form.routeId ?? ""} onChange={(event) => setForm({ ...form, routeId: event.target.value || null })}>
                  <option value="">{t("none")}</option>
                  {routeOptions.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
                </select>
                {routesState.error && <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t("routeLoadFailed")}</span>}
              </div>
            )}
          </Field>
        )}
        <div><div className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("selfRating")}</div><SelfRatingButtons value={form.selfRating ?? null} onChange={(selfRating) => setForm({ ...form, selfRating })} /></div>
      </div>
      {form.mode === "official" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("officialTournament")}>
            {officialTournamentsLoading ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">読み込み中...</div>
            ) : officialTournaments.length > 0 ? (
              <select className="input" value={form.officialTournamentId ?? ""} onChange={(event) => setForm({ ...form, officialTournamentId: event.target.value || undefined })}>
                <option value="">{t("officialTournamentUnset")}</option>
                {officialTournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
              </select>
            ) : (
              <Link href="/settings" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">{t("officialTournamentRegisterHint")}</Link>
            )}
          </Field>
          <Field label={t("officialRound")}>
            <select className="input" value={form.officialRound ?? ""} onChange={(event) => setForm({ ...form, officialRound: event.target.value || undefined })}>
              <option value="">-</option>
              {OFFICIAL_ROUNDS.map((round) => <option key={round} value={round}>{round}</option>)}
            </select>
          </Field>
          <Field label={t("opponentName")}>
            <input className="input" value={form.opponentName ?? ""} onChange={(event) => setForm({ ...form, opponentName: event.target.value })} placeholder="John" />
          </Field>
        </div>
      )}
      <Field label={t("memo")}>
        <textarea className="input min-h-32 resize-y leading-6" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} placeholder={"・どこでミスしたか\n・何が上手くいったか\n・次回試したいこと"} rows={5} />
      </Field>
      <button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white">{t("addRecord")}</button>
    </form>
  );
}

type ImportSaveSummary = {
  success: number;
  failed: number;
  failures: { index: number; log: Omit<PracticeLog, "id">; error: string }[];
};

async function saveImportedLogsToDb(logs: Omit<PracticeLog, "id">[]): Promise<ImportSaveSummary> {
  const summary: ImportSaveSummary = { success: 0, failed: 0, failures: [] };

  for (const [index, log] of logs.entries()) {
    const importLog = { ...log, source: "import" as const };
    try {
      await createPracticeLogInApi(practiceLogToDbPayload(importLog), "インポートログの保存に失敗しました。");
      summary.success += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        index,
        log,
        error: error instanceof Error ? error.message : "インポートログの保存に失敗しました。",
      });
    }
  }

  return summary;
}

function ImportSaveMessage({ summary }: { summary: ImportSaveSummary | null }) {
  if (!summary) return null;
  return (
    <div className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${summary.failed > 0 ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}>
      <p>インポート完了：{summary.success}件のログを追加しました{summary.failed > 0 ? ` / 失敗: ${summary.failed}件` : ""}</p>
      {summary.failures.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs font-medium">
          {summary.failures.map((failure) => (
            <li key={`${failure.log.date}-${failure.log.discipline}-${failure.index}`}>#{failure.index + 1} {failure.log.discipline} Score {failure.log.score ?? "-"} Time {failure.log.time ?? "-"}: {failure.error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportPage({ officialTournaments, onSaved }: { officialTournaments: OfficialTournament[]; onSaved: () => Promise<void> }) {
  const t = useT();
  const [mode, setMode] = useState<LogMode>("train");
  const [discipline, setDiscipline] = useState<Discipline>("Cards");
  const [date, setDate] = useState(todayIso());
  const [text, setText] = useState("");
  const [importMemo, setImportMemo] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSaveSummary | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [matchPlayerName, setMatchPlayerName] = useState("Yas");
  const [matchMode, setMatchMode] = useState<Extract<LogMode, "rated" | "official">>("rated");
  const [matchDate, setMatchDate] = useState(todayIso());
  const [matchOfficialTournamentId, setMatchOfficialTournamentId] = useState("");
  const [matchOfficialRound, setMatchOfficialRound] = useState("");
  const [matchText, setMatchText] = useState("");
  const [matchMemo, setMatchMemo] = useState("");
  const [matchSummary, setMatchSummary] = useState<ImportSaveSummary | null>(null);
  const [matchSaving, setMatchSaving] = useState(false);
  const result = useMemo(() => parseMemoryLeagueImportText({ text, mode, discipline, date }), [date, discipline, mode, text]);
  const matchParseResult = useMemo(() => parseMatchResultText(matchText), [matchText]);
  const matchPreview = useMemo(() => {
    const warnings = [...matchParseResult.warnings];
    const logs = matchParseResult.matches.flatMap((match) => {
      const extracted = extractPlayerLogFromMatch(match, matchPlayerName);
      if (!extracted) {
        warnings.push(`対象選手が見つかりません: ${match.winner} vs ${match.loser} (${match.discipline})`);
        return [];
      }
      return [{
        ...extracted,
        date: matchDate,
        mode: matchMode,
        officialTournamentId: matchMode === "official" ? matchOfficialTournamentId || undefined : undefined,
        officialRound: matchMode === "official" ? matchOfficialRound || undefined : undefined,
        memo: matchMemo,
      }];
    });
    if (!matchPlayerName.trim()) warnings.push("対象選手名を入力してください。");
    if (!matchDate) warnings.push("日付を入力してください。");
    if (logs.length === 0) warnings.push("取り込み件数 0件");
    return { logs, warnings };
  }, [matchDate, matchMemo, matchMode, matchOfficialRound, matchOfficialTournamentId, matchParseResult.matches, matchParseResult.warnings, matchPlayerName]);
  const importLogs = async () => {
    if (result.logs.length === 0 || result.errors.length > 0) return;
    setImportSaving(true);
    setImportSummary(null);
    const summary = await saveImportedLogsToDb(result.logs.map((log) => normalizeMemoryLeagueLog({ ...log, memo: importMemo })));
    setImportSummary(summary);
    if (summary.success > 0) {
      await onSaved().catch(() => {
        // Import succeeded; the shared log state can be refreshed from another page if this fails.
      });
    }
    setImportSaving(false);
    if (summary.failed === 0) {
      setText("");
      setImportMemo("");
    }
  };
  const importMatchLogs = async () => {
    if (matchPreview.logs.length === 0 || matchParseResult.errors.length > 0 || !matchPlayerName.trim() || !matchDate) return;
    setMatchSaving(true);
    setMatchSummary(null);
    const summary = await saveImportedLogsToDb(matchPreview.logs.map(normalizeMatchImportLog));
    setMatchSummary(summary);
    if (summary.success > 0) {
      await onSaved().catch(() => {
        // Import succeeded; the shared log state can be refreshed from another page if this fails.
      });
    }
    setMatchSaving(false);
    if (summary.failed === 0) {
      setMatchText("");
      setMatchMemo("");
    }
  };

  return (
    <Page title="インポート" subtitle="Memory Leagueの結果画面からコピーしたテキストを貼り付けて取り込みます。MVPでは手入力がメイン導線です。">
      <Panel title={t("import")}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="モード"><select className="input" value={mode} onChange={(event) => setMode(event.target.value as LogMode)}>{LOG_MODES.map((item) => <option key={item} value={item}>{getModeLabel(item)}</option>)}</select></Field>
          <Field label="日付"><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">種目</div>
          <div className="flex flex-wrap gap-2">
            {DISCIPLINES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDiscipline(item)}
                className={`min-h-11 rounded-md border px-3 py-2 text-sm font-bold transition ${discipline === item ? "ring-2 ring-zinc-950 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-950" : "hover:opacity-85"}`}
                style={getDisciplineBadgeStyle(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <Field label="貼り付けテキスト"><textarea className="input mt-4 min-h-56 font-mono text-sm" value={text} onChange={(event) => { setImportSummary(null); setText(event.target.value); }} placeholder={mode === "train" ? "Score: 0\nTime: 0.69 sec" : "Time: 48.07s\nScore: 52"} /></Field>
        <Field label={t("memo")}><textarea className="input mt-4 min-h-24 resize-y" value={importMemo} onChange={(event) => { setImportSummary(null); setImportMemo(event.target.value); }} placeholder="メモ" /></Field>
      </Panel>
      {result.errors.length > 0 && <Panel title="エラー"><ul className="grid gap-2 text-sm text-rose-700">{result.errors.map((error, index) => <li key={`${error}-${index}`} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">{error}</li>)}</ul></Panel>}
      <Panel title="プレビュー">
        {result.logs.length === 0 ? <p className="text-sm text-zinc-600">まだ記録を読み取れていません。</p> : <LogList logs={result.logs.map((log, index) => ({ ...normalizeMemoryLeagueLog(log), id: `preview-${index}` }))} />}
        <button onClick={importLogs} disabled={importSaving || result.logs.length === 0 || result.errors.length > 0} className="mt-4 h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-zinc-700">{importSaving ? "保存中..." : t("import")}</button>
        <ImportSaveMessage summary={importSummary} />
      </Panel>
      <Panel title="対戦結果貼り付けインポート">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="対象選手名"><input className="input" value={matchPlayerName} onChange={(event) => { setMatchSummary(null); setMatchPlayerName(event.target.value); }} placeholder="Yas" /></Field>
          <Field label="Mode"><select className="input" value={matchMode} onChange={(event) => setMatchMode(event.target.value as Extract<LogMode, "rated" | "official">)}><option value="rated">Rated</option><option value="official">Official</option></select></Field>
          <Field label="日付"><input className="input" type="date" value={matchDate} onChange={(event) => setMatchDate(event.target.value)} /></Field>
          {matchMode === "official" && <Field label={t("officialRound")}><select className="input" value={matchOfficialRound} onChange={(event) => setMatchOfficialRound(event.target.value)}><option value="">-</option>{OFFICIAL_ROUNDS.map((round) => <option key={round} value={round}>{round}</option>)}</select></Field>}
        </div>
        {matchMode === "official" && (
          <div className="mt-4 max-w-md">
            <Field label={t("officialTournament")}>
              <select className="input" value={matchOfficialTournamentId} onChange={(event) => setMatchOfficialTournamentId(event.target.value)}>
                <option value="">{t("officialTournamentUnset")}</option>
                {officialTournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field label="貼り付けテキスト"><textarea className="input mt-4 min-h-44 font-mono text-sm" value={matchText} onChange={(event) => { setMatchSummary(null); setMatchText(event.target.value); }} placeholder={"Yas beat Katie Kermode in Numbers\n(80 in 48.24s / 74 in 44.82s) 4 hours ago\n\nKatie Kermode beat Yas in Cards\n(52 in 60.00s / 34 in 27.94s) 4 hours ago"} /></Field>
        <Field label={t("memo")}><textarea className="input mt-4 min-h-24 resize-y" value={matchMemo} onChange={(event) => { setMatchSummary(null); setMatchMemo(event.target.value); }} placeholder="メモ" /></Field>
      </Panel>
      {(matchParseResult.errors.length > 0 || matchPreview.warnings.length > 0) && (
        <Panel title="読み取り結果">
          <div className="grid gap-2 text-sm">
            {matchParseResult.errors.map((error, index) => <div key={`${error}-${index}`} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">{error}</div>)}
            {matchPreview.warnings.map((warning, index) => <div key={`${warning}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{warning}</div>)}
          </div>
        </Panel>
      )}
      <Panel title="対戦結果プレビュー">
        {matchPreview.logs.length === 0 ? <p className="text-sm text-zinc-600">取り込み候補がありません。</p> : (
          <div className="grid gap-2">
            {matchPreview.logs.map((log, index) => (
              <div key={`${log.discipline}-${index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                {formatDisplayDate(log.date)} {log.discipline} {getModeLabel(log.mode)} vs {log.opponentName} {log.result === "win" ? "勝ち" : "負け"} Score {log.score} Time {formatTime(log.time)}s
                {log.mode === "official" && ` / ${getOfficialTournamentName(officialTournaments, log.officialTournamentId)}${log.officialRound ? ` / ${log.officialRound}` : ""}`}
              </div>
            ))}
          </div>
        )}
        <button onClick={importMatchLogs} disabled={matchSaving || matchPreview.logs.length === 0 || matchParseResult.errors.length > 0 || !matchPlayerName.trim() || !matchDate} className="mt-4 h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-zinc-700">{matchSaving ? "保存中..." : t("import")}</button>
        <ImportSaveMessage summary={matchSummary} />
      </Panel>
    </Page>
  );
}

function Analytics({ officialTournaments, practiceLogs, routesState }: { officialTournaments: OfficialTournament[]; practiceLogs: ReturnType<typeof usePracticeLogs>; routesState: ReturnType<typeof useRoutes> }) {
  const t = useT();
  const { logs, loading, error } = practiceLogs;
  const [modeFilter, setModeFilter] = useState<LogMode | "all">("all");
  const [officialTournamentFilter, setOfficialTournamentFilter] = useState<string | "all" | "unset">("all");
  const [selectedEvent, setSelectedEvent] = useState<EventFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [routeFilter, setRouteFilter] = useState<AnalyticsRouteFilter>("all");
  const [selfRatingFilter, setSelfRatingFilter] = useState<AnalyticsSelfRatingFilter>("all");
  const [ratingUpdateId, setRatingUpdateId] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState("");

  const months = useMemo(() => getAvailableMonths(logs), [logs]);
  const baseFilteredLogs = useMemo(() => {
    const base = getAnalyticsFilterState({ logs, mode: modeFilter, discipline: selectedEvent, period, customFrom, customTo });
    return modeFilter === "official" ? filterLogsByOfficialTournament(base, officialTournamentFilter) : base;
  }, [customFrom, customTo, logs, modeFilter, officialTournamentFilter, period, selectedEvent]);
  const routeFilteredLogs = useMemo(() => filterLogsByRoute(baseFilteredLogs, routeFilter), [baseFilteredLogs, routeFilter]);
  const filteredLogs = useMemo(() => filterLogsBySelfRating(routeFilteredLogs, selfRatingFilter), [routeFilteredLogs, selfRatingFilter]);
  const selfRatingBreakdown = useMemo(() => getSelfRatingBreakdown(routeFilteredLogs), [routeFilteredLogs]);
  const routeAnalysisLogs = useMemo(() => filterLogsBySelfRating(baseFilteredLogs, selfRatingFilter), [baseFilteredLogs, selfRatingFilter]);
  const routeAnalysis = useMemo(() => getRouteAnalysis(routeAnalysisLogs, routesState.routes), [routeAnalysisLogs, routesState.routes]);
  const routeFilterVisible = selectedEvent !== "all" && ROUTE_DISCIPLINES.includes(selectedEvent as RouteDiscipline);
  const routeOptions = routeFilterVisible ? routesForDiscipline(routesState.routes, selectedEvent) : [];
  const eventCards = useMemo(() => DISCIPLINES.map((discipline) => calculateEventStats(discipline, filteredLogs)), [filteredLogs]);
  const selectedStats = selectedEvent === "all" ? undefined : calculateEventStats(selectedEvent, filteredLogs);
  const selectedWindowStats = selectedEvent === "all" ? [] : getDisciplineWindowStats(filteredLogs).filter((item) => item.discipline === selectedEvent);
  const updateAnalyticsSelfRating = async (log: PracticeLog, selfRating: SelfRating | null) => {
    setRatingError("");
    setRatingUpdateId(log.id);
    try {
      await practiceLogs.updateSelfRating(log.id, selfRating);
    } catch (updateError) {
      setRatingError(updateError instanceof Error ? updateError.message : "自己評価の更新に失敗しました。");
    } finally {
      setRatingUpdateId(null);
    }
  };

  return (
    <Page title={t("analytics")} subtitle="">
      {loading && <Panel title={t("analytics")}><p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p></Panel>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {ratingError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{ratingError}</p>}
      <Panel title={t("filters")}>
        <FilterButtons label={t("discipline")} items={[{ value: "all", label: t("allDisciplines") }, ...DISCIPLINES.map((discipline) => ({ value: discipline, label: discipline }))]} value={selectedEvent} onChange={(value) => { setSelectedEvent(value as EventFilter); setRouteFilter("all"); }} />
        <FilterButtons label={t("period")} items={[{ value: "all", label: t("allPeriod") }, { value: "7", label: "7日" }, { value: "30", label: "30日" }, { value: "90", label: "90日" }, ...months.map((month) => ({ value: `month:${month}`, label: formatMonth(month) })), { value: "custom", label: t("custom") }]} value={period} onChange={(value) => setPeriod(value as PeriodFilter)} />
        {period === "custom" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label={t("startDate")}><input className="input" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></Field><Field label={t("endDate")}><input className="input" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></Field></div>}
        <FilterButtons label={t("mode")} items={[{ value: "all", label: "All" }, ...LOG_MODES.map((mode) => ({ value: mode, label: getModeLabel(mode) }))]} value={modeFilter} onChange={(value) => setModeFilter(value as LogMode | "all")} />
        {modeFilter === "official" && (
          <FilterButtons
            label={t("officialTournament")}
            items={[{ value: "all", label: t("officialTournamentAll") }, { value: "unset", label: t("officialTournamentUnset") }, ...officialTournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))]}
            value={officialTournamentFilter}
            onChange={(value) => setOfficialTournamentFilter(value)}
          />
        )}
        {routeFilterVisible && (
          <div className="mt-4 max-w-md">
            <Field label={t("route")}>
              <select className="input" disabled={routesState.loading || Boolean(routesState.error)} value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}>
                <option value="all">{t("all")}</option>
                <option value="unassigned">{t("unassigned")}</option>
                {routeOptions.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
              </select>
              {routesState.loading && <span className="text-xs text-zinc-500 dark:text-zinc-400">{t("loadingRoutes")}</span>}
              {routesState.error && <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t("routeLoadFailed")}</span>}
            </Field>
          </div>
        )}
        <FilterButtons label={t("selfRating")} items={[{ value: "all", label: t("all") }, { value: "unrated", label: t("notRated") }, { value: "good", label: "○" }, { value: "neutral", label: "▲" }, { value: "bad", label: "×" }]} value={selfRatingFilter} onChange={(value) => setSelfRatingFilter(value as AnalyticsSelfRatingFilter)} />
      </Panel>
      {!loading && !error && (
        <Panel title={t("selfRatingBreakdown")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["good", "neutral", "bad"] as const).map((rating) => <div key={rating} className="rounded-lg border border-zinc-200 bg-white p-4 text-center text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"><div className="text-2xl font-black">{SELF_RATING_SYMBOLS[rating]}</div><div className="mt-1 text-lg font-bold">{selfRatingBreakdown[rating]}</div></div>)}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"><div className="text-sm font-bold">{t("notRated")}</div><div className="mt-1 text-lg font-bold">{selfRatingBreakdown.unrated}</div></div>
          </div>
        </Panel>
      )}
      {!loading && !error && routeFilterVisible && !routesState.loading && !routesState.error && (
        <Panel title={t("routeAnalysis")}>
          {routeAnalysis.length === 0 ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("noLogsInPeriod")}</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{routeAnalysis.map((item) => <article key={item.routeId ?? "unassigned"} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"><div className="font-black">{item.routeName ?? t("unassigned")}</div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><MiniMetric label={t("logsCount")} value={String(item.count)} /><MiniMetric label={t("averageScore")} value={record(item.averageScore)} /><MiniMetric label={t("averageTime")} value={`${formatTime(item.averageTime)}s`} /></div><div className="mt-3 text-sm font-semibold">○ {item.selfRatings.good} / ▲ {item.selfRatings.neutral} / × {item.selfRatings.bad}</div></article>)}</div>}
        </Panel>
      )}
      {!loading && !error && filteredLogs.length === 0 ? (
        <Panel title={t("analytics")}><p className="text-sm text-zinc-600">{t("noLogsInPeriod")}</p></Panel>
      ) : !loading && !error && selectedEvent === "all" ? (
        <>
          <Panel title={t("eventAnalysis")}><EventStatsGrid stats={eventCards} /></Panel>
          <Panel title={t("allLogs")}><LogList logs={filteredLogs} officialTournaments={officialTournaments} onSelfRatingChange={updateAnalyticsSelfRating} selfRatingUpdatingId={ratingUpdateId} /></Panel>
        </>
      ) : !loading && !error ? (
        <>
          <Panel title={`${selectedEvent} ${t("eventAnalysis")}`}>
            <EventStatsGrid stats={selectedStats ? [selectedStats] : []} />
            <div className="mt-4"><DisciplineWindowGrid data={selectedWindowStats} /></div>
          </Panel>
          <Panel title={`${selectedEvent} ${t("logList")}`}><LogList logs={filteredLogs} officialTournaments={officialTournaments} onSelfRatingChange={updateAnalyticsSelfRating} selfRatingUpdatingId={ratingUpdateId} /></Panel>
        </>
      ) : null}
    </Page>
  );
}

function Opponents({ opponentsState }: { opponentsState: ReturnType<typeof useOpponents> }) {
  const t = useT();
  const [form, setForm] = useState(emptyOpponent);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { opponents, loading } = opponentsState;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setNotice("");
    setError("");
    const payload = {
      ...form,
      averages: normalizeOpponentNumbers(form.averages),
      successRates: normalizeOpponentNumbers(form.successRates),
    };
    try {
      if (editingId) {
        await opponentsState.update(editingId, payload);
        setEditingId(undefined);
        setNotice("保存しました。");
      } else {
        await opponentsState.create(payload);
        setNotice("追加しました。");
      }
      setForm(emptyOpponent());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "対戦相手の保存に失敗しました。");
    }
  };
  const startEdit = (opponent: Opponent) => {
    setEditingId(opponent.id);
    setForm({ name: opponent.name, averages: opponent.averages, successRates: opponent.successRates, memo: opponent.memo });
  };
  const remove = async (id: string) => {
    if (!window.confirm("この対戦相手を削除しますか？")) return;
    setNotice("");
    setError("");
    try {
      await opponentsState.remove(id);
      if (editingId === id) {
        setEditingId(undefined);
        setForm(emptyOpponent());
      }
      setNotice("削除しました。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "対戦相手の削除に失敗しました。");
    }
  };
  return (
    <Page title={t("opponents")} subtitle="">
      {opponentsState.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{opponentsState.error}</p>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      <Panel title={t("opponentInput")}>
        <form onSubmit={submit} className="grid gap-4">
          <Field label={t("playerName")}><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("playerName")} /></Field>
          <div className="grid gap-3 md:grid-cols-3">{DISCIPLINES.map((discipline) => <div key={discipline} className="rounded-lg border p-3" style={getDisciplineCardStyle(discipline)}><DisciplineBadge discipline={discipline} compact={discipline === "International Names"} /><NumberField label="Time" value={form.averages[discipline]} onChange={(value) => setForm({ ...form, averages: { ...form.averages, [discipline]: value } })} placeholder="例: 48.07" step="0.01" /><NumberField label="Score" value={form.successRates[discipline]} onChange={(value) => setForm({ ...form, successRates: { ...form.successRates, [discipline]: value } })} placeholder="例: 52" step="0.1" /></div>)}</div>
          <Field label={t("memo")}><textarea className="input min-h-24" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white">{editingId ? t("save") : t("addOpponent")}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(undefined); setForm(emptyOpponent()); }} className="h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">{t("cancel")}</button>}
          </div>
        </form>
      </Panel>
      {loading ? <Panel title={t("opponents")}><p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p></Panel> : <div className="grid gap-4 lg:grid-cols-2">{opponents.map((opponent) => <Panel key={opponent.id} title={opponent.name}><div className="mb-4 flex gap-2"><button onClick={() => startEdit(opponent)} className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-semibold hover:bg-white">{t("edit")}</button><button onClick={() => remove(opponent.id)} className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t("delete")}</button></div><div className="grid gap-2 sm:grid-cols-2">{DISCIPLINES.map((discipline) => <div key={discipline} className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm"><DisciplineBadge discipline={discipline} compact={discipline === "International Names"} /><span className="font-semibold">{formatTime(opponent.averages[discipline])}秒 / {percent(opponent.successRates[discipline])}</span></div>)}</div><p className="mt-4 text-sm text-zinc-600">{opponent.memo}</p></Panel>)}</div>}
    </Page>
  );
}

function normalizeOpponentNumbers(values: Record<Discipline, NumberInputValue>) {
  return Object.fromEntries(DISCIPLINES.map((discipline) => [discipline, values[discipline] === "" ? 0 : values[discipline]])) as Record<Discipline, number>;
}

function MatchPlan({ data, setData, opponentsState }: { data: CoachData; setData: React.Dispatch<React.SetStateAction<CoachData>>; opponentsState: ReturnType<typeof useOpponents> }) {
  const t = useT();
  const opponent = opponentsState.opponents.find((item) => item.id === data.settings.nextOpponentId) ?? opponentsState.opponents[0];
  const plan = buildMatchPlan(data.logs, opponent);
  return (
    <Page title={t("matchPlan")} subtitle="">
      {opponentsState.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{opponentsState.error}</p>}
      <Panel title={t("opponents")}>{opponentsState.loading ? <p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p> : <select className="input max-w-md" value={opponent?.id ?? ""} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, nextOpponentId: event.target.value } }))}>{opponentsState.opponents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</Panel>
      <div className="grid gap-4 md:grid-cols-4"><Metric label={t("targetDisciplines")} value={plan.targets.join(" / ") || "-"} detail={t("matchPlan")} /><Metric label={t("warningDisciplines")} value={plan.warnings.join(" / ") || "-"} detail={t("successRate")} /><Metric label={t("lowerPriority")} value={plan.discardable.join(" / ") || "-"} detail={t("discipline")} /><Metric label={t("preMatchMenu")} value={plan.menu.join(" / ")} detail={t("practiceInput")} /></div>
      <Panel title={t("practicePolicy")}><p className="text-lg font-semibold">{plan.winLine}</p></Panel>
      <Panel title={t("disciplineComparison")}><div className="grid gap-3">{plan.comparison.map((item) => <div key={item.discipline} className="rounded-lg border bg-white p-4" style={getDisciplineCardStyle(item.discipline)}><div className="flex flex-wrap items-center justify-between gap-2"><DisciplineBadge discipline={item.discipline} /><div className={item.edge >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>Edge {item.edge.toFixed(1)}</div></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div>{t("averageTime")} {formatTime(item.averageTime)}秒 / {t("successRate")} {percent(item.successRate)}</div><div>{t("opponents")} {formatTime(item.opponentAverage)}秒 / {t("successRate")} {percent(item.opponentSuccessRate)}</div></div></div>)}</div></Panel>
    </Page>
  );
}

function WeeklyReview({ practiceLogs }: { practiceLogs: ReturnType<typeof usePracticeLogs> }) {
  const t = useT();
  const { logs, loading, error } = practiceLogs;

  const review = getWeeklyReview(logs);
  return (
    <Page title={t("weeklyReview")} subtitle="">
      {loading && <Panel title={t("weeklyReview")}><p className="text-sm text-zinc-600 dark:text-zinc-300">読み込み中...</p></Panel>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {!loading && !error && logs.length === 0 ? (
        <Panel title={t("weeklyReview")}><p className="text-sm text-zinc-600 dark:text-zinc-300">{t("insufficientData")}</p></Panel>
      ) : !loading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-4"><Metric label={t("weeklyAttempts")} value={`${review.attempts}回`} detail={t("recent7Days")} /><Metric label={t("mostImproved")} value={review.improved} detail={t("successRate")} /><Metric label={t("highFailure")} value={review.worstFailure} detail={t("practiceLogs")} /><Metric label={t("nextWeekFocus")} value={review.focus.join(" / ")} detail={t("discipline")} /></div>
          <Panel title={t("nextWeekPolicy")}><div className="grid gap-3 md:grid-cols-3">{review.focus.map((discipline) => <div key={discipline} className="rounded-lg border bg-white p-4" style={getDisciplineCardStyle(discipline)}><DisciplineBadge discipline={discipline} /><p className="mt-2 text-sm">{t("practiceInput")}</p></div>)}<div className="rounded-lg border border-zinc-200 bg-white p-4"><div className="text-lg font-bold">{t("weeklyReview")}</div><p className="mt-2 text-sm text-zinc-600">{t("practiceLogs")}</p></div></div></Panel>
        </>
      ) : null}
    </Page>
  );
}

function SettingsView({
  data,
  setData,
  tournamentsState,
  officialTournamentsState,
  opponentsState,
  routesState,
  refreshPracticeLogs,
  theme,
  setTheme,
  language,
  setLanguage,
}: {
  data: CoachData;
  setData: React.Dispatch<React.SetStateAction<CoachData>>;
  tournamentsState: ReturnType<typeof useTournaments>;
  officialTournamentsState: ReturnType<typeof useOfficialTournaments>;
  opponentsState: ReturnType<typeof useOpponents>;
  routesState: ReturnType<typeof useRoutes>;
  refreshPracticeLogs: () => Promise<void>;
  theme: ThemeMode;
  setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>;
  language: Language;
  setLanguage: React.Dispatch<React.SetStateAction<Language>>;
}) {
  const t = useT();
  const reset = () => setData((current) => ({ ...current, settings: sampleData.settings }));
  const { tournaments } = tournamentsState;
  const { officialTournaments } = officialTournamentsState;
  const [editingTournamentId, setEditingTournamentId] = useState<string | undefined>();
  const [form, setForm] = useState(emptyTournament);
  const [editingOfficialTournamentId, setEditingOfficialTournamentId] = useState<string | undefined>();
  const [officialForm, setOfficialForm] = useState(emptyOfficialTournament);
  const [settingsError, setSettingsError] = useState("");
  const [routeFormVisible, setRouteFormVisible] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | undefined>();
  const [routeForm, setRouteForm] = useState<RouteFormState>(emptyRoute);
  const [routeSaving, setRouteSaving] = useState(false);
  const sortedRoutes = sortRoutesForSettings(routesState.routes);
  const resetRouteForm = () => {
    setEditingRouteId(undefined);
    setRouteForm(emptyRoute());
    setRouteFormVisible(false);
  };
  const submitRoute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!routeForm.name.trim()) return;
    setSettingsError("");
    setRouteSaving(true);
    try {
      const payload = { ...routeForm, name: routeForm.name.trim(), memo: routeForm.memo?.trim() || null };
      if (editingRouteId) await routesState.updateRoute(editingRouteId, payload);
      else await routesState.createRoute(payload);
      resetRouteForm();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "ルートの保存に失敗しました。");
    } finally {
      setRouteSaving(false);
    }
  };
  const startRouteEdit = (route: Route) => {
    if (!ROUTE_DISCIPLINES.includes(route.discipline as RouteDiscipline)) return;
    setSettingsError("");
    setEditingRouteId(route.id);
    setRouteForm({ discipline: route.discipline as RouteDiscipline, name: route.name, memo: route.memo ?? "" });
    setRouteFormVisible(true);
  };
  const removeRoute = async (route: Route) => {
    if (!window.confirm(`「${route.name}」を削除しますか？`)) return;
    setSettingsError("");
    try {
      await routesState.deleteRoute(route.id);
      if (editingRouteId === route.id) resetRouteForm();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "ルートの削除に失敗しました。");
    }
  };
  const submitTournament = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.date) return;
    setSettingsError("");
    try {
      if (editingTournamentId) {
        await tournamentsState.update(editingTournamentId, form);
        setEditingTournamentId(undefined);
      } else {
        await tournamentsState.create(form);
      }
      setForm(emptyTournament());
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "大会の保存に失敗しました。");
    }
  };
  const startTournamentEdit = (tournament: Tournament) => {
    setEditingTournamentId(tournament.id);
    setForm({ name: tournament.name, date: tournament.date, goal: tournament.goal ?? "", memo: tournament.memo ?? "" });
  };
  const removeTournament = async (id: string) => {
    if (!window.confirm("この大会を削除しますか？")) return;
    setSettingsError("");
    try {
      await tournamentsState.remove(id);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "大会の削除に失敗しました。");
    }
  };
  const submitOfficialTournament = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!officialForm.name.trim() || !officialForm.date) return;
    setSettingsError("");
    try {
      if (editingOfficialTournamentId) {
        await officialTournamentsState.update(editingOfficialTournamentId, officialForm);
        setEditingOfficialTournamentId(undefined);
      } else {
        await officialTournamentsState.create(officialForm);
      }
      setOfficialForm(emptyOfficialTournament());
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Official大会の保存に失敗しました。");
    }
  };
  const startOfficialTournamentEdit = (tournament: OfficialTournament) => {
    setEditingOfficialTournamentId(tournament.id);
    setOfficialForm({ name: tournament.name, date: tournament.date, memo: tournament.memo ?? "" });
  };
  const removeOfficialTournament = async (id: string) => {
    if (!window.confirm("このOfficial大会を削除しますか？")) return;
    setSettingsError("");
    try {
      await officialTournamentsState.remove(id);
      await refreshPracticeLogs().catch(() => {});
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Official大会の削除に失敗しました。");
    }
  };
  return (
    <Page title={t("settings")} subtitle="">
      {(settingsError || routesState.error || tournamentsState.error || officialTournamentsState.error) && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{settingsError || routesState.error || tournamentsState.error || officialTournamentsState.error}</p>}
      <Panel title={t("displaySettings")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-bold text-zinc-700">{t("themeSetting")}</div>
            <div className="flex flex-wrap gap-2">
              {(["light", "dark"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setTheme(item)} className={`rounded-md border px-4 py-2 text-sm font-bold transition ${theme === item ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                  {t(item)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-bold text-zinc-700">{t("languageSetting")}</div>
            <div className="flex flex-wrap gap-2">
              {(["ja", "en"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setLanguage(item)} className={`rounded-md border px-4 py-2 text-sm font-bold transition ${language === item ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                  {item === "ja" ? t("japanese") : t("english")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title={t("routeManagement")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Cards / Numbers / Images / Words</p>
          <button type="button" onClick={() => { setSettingsError(""); setEditingRouteId(undefined); setRouteForm(emptyRoute()); setRouteFormVisible(true); }} className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
            {t("addRoute")}
          </button>
        </div>
        {routeFormVisible && (
          <form onSubmit={submitRoute} className="mt-4 grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2">
            <Field label={t("discipline")}>
              <select className="input" value={routeForm.discipline} onChange={(event) => setRouteForm({ ...routeForm, discipline: event.target.value as RouteDiscipline })}>
                {ROUTE_DISCIPLINES.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
              </select>
            </Field>
            <Field label={t("routeName")}><input className="input" required value={routeForm.name} onChange={(event) => setRouteForm({ ...routeForm, name: event.target.value })} /></Field>
            <Field label={t("memo")} className="md:col-span-2"><textarea className="input min-h-20 resize-y" value={routeForm.memo ?? ""} onChange={(event) => setRouteForm({ ...routeForm, memo: event.target.value })} /></Field>
            <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
              <button disabled={routeSaving} className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{routeSaving ? "保存中..." : editingRouteId ? t("save") : t("addRoute")}</button>
              <button type="button" disabled={routeSaving} onClick={resetRouteForm} className="h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-white disabled:opacity-60">{t("cancel")}</button>
            </div>
          </form>
        )}
        {routesState.loading ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{t("loadingRoutes")}</p> : (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {ROUTE_DISCIPLINES.map((discipline) => {
              const disciplineRoutes = sortedRoutes.filter((route) => route.discipline === discipline);
              return (
                <section key={discipline} className="min-w-0">
                  <h3 className="border-b border-zinc-200 pb-2 text-base font-black">{discipline}</h3>
                  {disciplineRoutes.length === 0 ? <p className="py-3 text-sm text-zinc-500">{t("noRoutes")}</p> : (
                    <div className="divide-y divide-zinc-200">
                      {disciplineRoutes.map((route) => (
                        <article key={route.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="break-words font-bold">{route.name}</div>
                            {route.memo && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-600 dark:text-zinc-300">{route.memo}</p>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button type="button" onClick={() => startRouteEdit(route)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50">{t("edit")}</button>
                            <button type="button" onClick={() => void removeRoute(route)} className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t("delete")}</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel title={editingOfficialTournamentId ? t("officialTournamentEdit") : t("officialTournamentRecords")}>
        <form onSubmit={submitOfficialTournament} className="grid gap-4 md:grid-cols-3">
          <Field label={t("tournamentName")}><input className="input" value={officialForm.name} onChange={(event) => setOfficialForm({ ...officialForm, name: event.target.value })} placeholder="Memory League Online Championship" /></Field>
          <Field label={t("tournamentDate")}><input className="input" type="date" value={officialForm.date} onChange={(event) => setOfficialForm({ ...officialForm, date: event.target.value })} /></Field>
          <Field label={t("memo")}><input className="input" value={officialForm.memo ?? ""} onChange={(event) => setOfficialForm({ ...officialForm, memo: event.target.value })} /></Field>
          <div className="flex flex-col gap-2 md:col-span-3 sm:flex-row">
            <button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white">{editingOfficialTournamentId ? t("save") : t("officialTournamentAdd")}</button>
            {editingOfficialTournamentId && <button type="button" onClick={() => { setEditingOfficialTournamentId(undefined); setOfficialForm(emptyOfficialTournament()); }} className="h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">{t("cancel")}</button>}
          </div>
        </form>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {officialTournamentsState.loading ? <p className="text-sm text-zinc-600">読み込み中...</p> : officialTournaments.length === 0 ? <p className="text-sm text-zinc-600">{t("officialTournamentRegisterHint")}</p> : officialTournaments.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((tournament) => (
            <article key={tournament.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black">{tournament.name}</div>
                  <div className="mt-1 text-sm text-zinc-600">{formatDisplayDate(tournament.date)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startOfficialTournamentEdit(tournament)} className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-semibold hover:bg-white">{t("edit")}</button>
                  <button onClick={() => removeOfficialTournament(tournament.id)} className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t("delete")}</button>
                </div>
              </div>
              {tournament.memo && <p className="mt-2 text-sm text-zinc-600">{tournament.memo}</p>}
            </article>
          ))}
        </div>
      </Panel>
      <Panel title={editingTournamentId ? t("tournamentEdit") : t("tournamentAdd")}><form onSubmit={submitTournament} className="grid gap-4 md:grid-cols-2"><Field label={t("tournamentName")}><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例: 日本大会" /></Field><Field label={t("tournamentDate")}><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label={t("goal")}><input className="input" value={form.goal ?? ""} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="例: Cardsを安定して取る" /></Field><Field label={t("memo")}><textarea className="input min-h-24 resize-y" value={form.memo ?? ""} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field><div className="flex flex-col gap-2 md:col-span-2 sm:flex-row"><button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white">{editingTournamentId ? t("save") : t("tournamentAdd")}</button>{editingTournamentId && <button type="button" onClick={() => { setEditingTournamentId(undefined); setForm(emptyTournament()); }} className="h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">{t("cancel")}</button>}</div></form></Panel>
      <Panel title={t("tournaments")}>{tournamentsState.loading ? <p className="text-sm text-zinc-600">読み込み中...</p> : tournaments.length === 0 ? <p className="text-sm text-zinc-600">大会が登録されていません。</p> : <div className="grid gap-3 md:grid-cols-2">{tournaments.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((tournament) => <article key={tournament.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black">{tournament.name}</div><div className="mt-1 text-sm text-zinc-600">{tournament.date}</div></div><div className="flex gap-2"><button onClick={() => startTournamentEdit(tournament)} className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-semibold hover:bg-white">{t("edit")}</button><button onClick={() => removeTournament(tournament.id)} className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t("delete")}</button></div></div>{tournament.goal && <p className="mt-3 text-sm font-semibold">{t("goal")}: {tournament.goal}</p>}{tournament.memo && <p className="mt-2 text-sm text-zinc-600">{tournament.memo}</p>}</article>)}</div>}</Panel>
      <Panel title={t("basicSettings")}><div className="grid gap-4 md:grid-cols-2"><Field label={t("playerName")}><input className="input" value={data.settings.playerName} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, playerName: event.target.value } }))} /></Field><Field label={t("nextOpponentSetting")}>{opponentsState.loading ? <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">読み込み中...</div> : <select className="input" value={data.settings.nextOpponentId} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, nextOpponentId: event.target.value } }))}>{opponentsState.opponents.map((opponent) => <option key={opponent.id} value={opponent.id}>{opponent.name}</option>)}</select>}</Field></div></Panel>
      <Panel title={t("data")}><p className="text-sm text-zinc-600">localStorage</p><button onClick={reset} className="mt-4 h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">{t("resetSample")}</button></Panel>
    </Page>
  );
}

function EditableLogsTable({ logs, officialTournaments, routesState, onUpdate, onDelete }: { logs: PracticeLog[]; officialTournaments: OfficialTournament[]; routesState: ReturnType<typeof useRoutes>; onUpdate: (log: PracticeLog) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }) {
  const t = useT();
  const [editingId, setEditingId] = useState<string | undefined>();
  const [draft, setDraft] = useState<PracticeLogFormState>(emptyLog);
  const startEdit = (log: PracticeLog) => {
    setEditingId(log.id);
    setDraft({ date: log.date, discipline: log.discipline, mode: log.mode ?? "train", officialTournamentId: log.officialTournamentId, officialRound: log.officialRound, opponentName: log.opponentName, score: log.score ?? "", time: log.time ?? "", memo: log.memo, routeId: log.routeId ?? null, selfRating: log.selfRating ?? null });
  };
  const save = async (id: string) => {
    const normalized = normalizeMemoryLeagueLog({ ...draft, score: draft.score === "" ? undefined : draft.score, time: draft.time === "" ? undefined : draft.time });
    const ok = await onUpdate({ ...normalized, id });
    if (ok) setEditingId(undefined);
  };
  const confirmDelete = async (id: string) => {
    if (window.confirm("このログを削除しますか？")) await onDelete(id);
  };
  return (
    <Panel title={t("recentRecords")}>
      <LogTable logs={logs} officialTournaments={officialTournaments} routesState={routesState} editingId={editingId} draft={draft} onDraftChange={setDraft} onEdit={startEdit} onSave={save} onCancel={() => setEditingId(undefined)} onDelete={confirmDelete} />
    </Panel>
  );
}

function LogList({ logs, officialTournaments = [], onSelfRatingChange, selfRatingUpdatingId }: { logs: PracticeLog[]; officialTournaments?: OfficialTournament[]; onSelfRatingChange?: (log: PracticeLog, selfRating: SelfRating | null) => void | Promise<void>; selfRatingUpdatingId?: string | null }) {
  return <LogTable logs={logs} officialTournaments={officialTournaments} onSelfRatingChange={onSelfRatingChange} selfRatingUpdatingId={selfRatingUpdatingId} />;
}

function LogTable({
  logs,
  officialTournaments,
  routesState,
  editingId,
  draft,
  onDraftChange,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onSelfRatingChange,
  selfRatingUpdatingId,
}: {
  logs: PracticeLog[];
  officialTournaments: OfficialTournament[];
  routesState?: ReturnType<typeof useRoutes>;
  editingId?: string;
  draft?: PracticeLogFormState;
  onDraftChange?: (draft: PracticeLogFormState) => void;
  onEdit?: (log: PracticeLog) => void;
  onSave?: (id: string) => void | Promise<void>;
  onCancel?: () => void;
  onDelete?: (id: string) => void | Promise<void>;
  onSelfRatingChange?: (log: PracticeLog, selfRating: SelfRating | null) => void | Promise<void>;
  selfRatingUpdatingId?: string | null;
}) {
  const t = useT();
  const canEdit = Boolean(onEdit && onSave && onCancel && onDelete);
  const cellClass = "whitespace-nowrap px-3 py-3 align-middle text-sm";
  const editInputClass = "h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-zinc-950";
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full min-w-[1120px] table-fixed divide-y divide-zinc-200 text-left">
        <colgroup>
          <col className="w-24" />
          <col className="w-32" />
          <col className="w-40" />
          <col className="w-16" />
          <col className="w-16" />
          <col className="w-16" />
          <col className="w-28" />
          <col className="w-28" />
          <col />
          <col className="w-36" />
        </colgroup>
        <thead className="bg-zinc-50 text-xs font-bold text-zinc-500">
          <tr>
            {[t("date"), t("discipline"), "Mode", "Score", "Time", t("judgment"), t("route"), t("selfRating"), t("memo")].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}
            <th className="sticky right-0 z-10 bg-zinc-50 px-3 py-2 text-zinc-600 shadow-[-1px_0_0_#e4e4e7] dark:bg-zinc-900 dark:text-zinc-300">{t("actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {logs.map((log) => {
            const isEditing = editingId === log.id && draft && onDraftChange && onSave && onCancel;
            return (
              <tr key={log.id} className={isEditing ? "bg-amber-50/60" : "hover:bg-zinc-50"}>
                <td className={cellClass}>
                  {isEditing ? <input className={editInputClass} type="date" value={draft.date} onChange={(event) => onDraftChange({ ...draft, date: event.target.value })} aria-label={t("date")} /> : formatDisplayDate(log.date)}
                </td>
                <td className={cellClass}><DisciplineBadge discipline={log.discipline} /></td>
                <td className={cellClass}>
                  {isEditing ? (
                    <div className="grid gap-2">
                      <select className={editInputClass} value={draft.mode} onChange={(event) => onDraftChange({ ...draft, mode: event.target.value as LogMode })} aria-label="Mode">{LOG_MODES.map((mode) => <option key={mode} value={mode}>{getModeLabel(mode)}</option>)}</select>
                      {draft.mode === "official" && (
                        <>
                          <select className={editInputClass} value={draft.officialTournamentId ?? ""} onChange={(event) => onDraftChange({ ...draft, officialTournamentId: event.target.value || undefined })} aria-label={t("officialTournament")}>
                            <option value="">{t("officialTournamentUnset")}</option>
                            {officialTournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
                          </select>
                          <select className={editInputClass} value={draft.officialRound ?? ""} onChange={(event) => onDraftChange({ ...draft, officialRound: event.target.value || undefined })} aria-label={t("officialRound")}>
                            <option value="">-</option>
                            {OFFICIAL_ROUNDS.map((round) => <option key={round} value={round}>{round}</option>)}
                          </select>
                          <input className={editInputClass} value={draft.opponentName ?? ""} onChange={(event) => onDraftChange({ ...draft, opponentName: event.target.value })} aria-label={t("opponentName")} placeholder="John" />
                        </>
                      )}
                    </div>
                  ) : <ModeBadge mode={log.mode} officialTournamentName={log.mode === "official" ? getOfficialTournamentName(officialTournaments, log.officialTournamentId) : undefined} officialRound={log.officialRound} opponentName={log.opponentName} result={log.result} />}
                </td>
                <td className={`${cellClass} font-semibold`}>
                  {isEditing ? <input className={editInputClass} type="number" min="0" step="1" value={draft.score} onChange={(event) => onDraftChange({ ...draft, score: event.target.value === "" ? "" : Number(event.target.value) })} aria-label="Score" /> : log.score ?? 0}
                </td>
                <td className={`${cellClass} font-semibold`}>
                  {isEditing ? <input className={editInputClass} type="number" min="0" step="0.01" value={draft.time} onChange={(event) => onDraftChange({ ...draft, time: event.target.value === "" ? "" : Number(event.target.value) })} aria-label="Time" /> : `${formatTime(log.time ?? 0)}s`}
                </td>
                <td className={`${cellClass} font-semibold`}>{isSuccessfulLog(isEditing ? { ...log, score: draft.score === "" ? 0 : draft.score } : log) ? "○" : "×"}</td>
                <td className={cellClass}>
                  {isEditing && ROUTE_DISCIPLINES.includes(draft.discipline as RouteDiscipline) ? (
                    routesState?.loading ? <span className="text-xs text-zinc-500">{t("loadingRoutes")}</span> : (
                      <select className={editInputClass} value={draft.routeId ?? ""} onChange={(event) => onDraftChange({ ...draft, routeId: event.target.value || null })} aria-label={t("route")}>
                        <option value="">{t("none")}</option>
                        {routesForDiscipline(routesState?.routes ?? [], draft.discipline).map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
                      </select>
                    )
                  ) : log.route?.name ? <span className="block truncate" title={log.route.name}>{log.route.name}</span> : "-"}
                </td>
                <td className={cellClass}>
                  {isEditing ? <SelfRatingButtons value={draft.selfRating ?? null} onChange={(selfRating) => onDraftChange({ ...draft, selfRating })} compact /> : onSelfRatingChange ? <div className={selfRatingUpdatingId === log.id ? "pointer-events-none opacity-50" : ""}><SelfRatingButtons value={log.selfRating ?? null} onChange={(selfRating) => void onSelfRatingChange(log, selfRating)} compact /></div> : <SelfRatingDisplay value={log.selfRating ?? null} />}
                </td>
                <td className="min-w-0 px-3 py-3 align-middle text-sm">
                  {isEditing ? (
                    <textarea className={`${editInputClass} min-h-16 resize-y whitespace-pre-wrap py-2`} value={draft.memo} onChange={(event) => onDraftChange({ ...draft, memo: event.target.value })} aria-label={t("memo")} rows={2} />
                  ) : (
                    <div className="max-w-full overflow-x-auto whitespace-nowrap pb-1 text-zinc-800 dark:text-zinc-200" tabIndex={log.memo ? 0 : undefined} aria-label={log.memo ? t("memo") : undefined}>{log.memo || "-"}</div>
                  )}
                </td>
                <td className={`${cellClass} sticky right-0 z-[1] bg-white text-zinc-900 shadow-[-1px_0_0_#e4e4e7] dark:bg-zinc-900 dark:text-zinc-100`}>
                  {isEditing ? (
                    <div className="flex gap-2"><button onClick={() => onSave(log.id)} className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white">{t("save")}</button><button onClick={onCancel} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-white">{t("cancel")}</button></div>
                  ) : canEdit ? (
                    <div className="flex gap-2"><button onClick={() => onEdit?.(log)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-white">{t("edit")}</button><button onClick={() => onDelete?.(log.id)} className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t("delete")}</button></div>
                  ) : (
                    <span className="text-zinc-400">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDisplayDate(date: string) {
  return date.replaceAll("-", "/");
}

function EventStatsGrid({ stats }: { stats: ReturnType<typeof getDisciplineStats> }) {
  const t = useT();
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{stats.map((item) => <div key={item.discipline} className="rounded-lg border bg-zinc-50 p-4" style={getDisciplineCardStyle(item.discipline)}><DisciplineBadge discipline={item.discipline} /><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><MiniMetric label={t("attempts")} value={`${item.attempts}回`} /><MiniMetric label={t("averageScore")} value={record(item.averageScore)} /><MiniMetric label={t("averageTime")} value={`${formatTime(item.averageTime)}秒`} /><MiniMetric label={t("successRate")} value={percent(item.successRate)} /><MiniMetric label={t("bestScore")} value={record(item.bestScore)} /><MiniMetric label={t("bestTime")} value={`${formatTime(item.bestTime)}秒`} /></div></div>)}</div>;
}

function DisciplineWindowGrid({ data }: { data: ReturnType<typeof getDisciplineWindowStats> }) {
  const t = useT();
  return <div className="grid gap-4">{data.map((item) => <section key={item.discipline} className="rounded-lg border bg-zinc-50 p-4" style={getDisciplineCardStyle(item.discipline)}><DisciplineBadge discipline={item.discipline} /><div className="mt-4 grid gap-3 xl:grid-cols-4">{item.windows.map((window) => <div key={window.size} className="rounded-lg border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><div className="font-bold">直近{window.size}回</div>{!window.isEnoughData && <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">{t("insufficientData")}</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><MiniMetric label={t("averageScore")} value={window.isEnoughData ? record(window.averageScore) : "-"} /><MiniMetric label={t("averageTime")} value={window.isEnoughData ? `${formatTime(window.averageTime)}秒` : "-"} /><MiniMetric label={t("successRate")} value={window.isEnoughData ? percent(window.successRate) : "-"} /><MiniMetric label={t("stability")} value={window.isEnoughData ? percent(window.stability) : "-"} /><MiniMetric label={t("bestScore")} value={window.isEnoughData ? record(window.bestScore) : "-"} /><MiniMetric label={t("bestTime")} value={window.isEnoughData ? `${formatTime(window.bestTime)}秒` : "-"} /></div></div>)}</div></section>)}</div>;
}

function FilterButtons({ label, items, value, onChange }: { label: string; items: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <div className="mt-3"><div className="mb-2 text-sm font-bold text-zinc-700">{label}</div><div className="flex flex-wrap gap-2">{items.map((item) => {
    const selected = value === item.value;
    const discipline = isDiscipline(item.value) ? item.value : undefined;
    return <button key={item.value} onClick={() => onChange(item.value)} style={discipline && !selected ? getDisciplineBadgeStyle(discipline) : undefined} className={`rounded-md border px-3 py-2 text-sm font-semibold ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{item.label}</button>;
  })}</div></div>;
}

function isDiscipline(value: string): value is Discipline {
  return DISCIPLINES.includes(value as Discipline);
}

function formatMonth(month: string) {
  const [year, rawMonth] = month.split("-");
  return `${year}年${Number(rawMonth)}月`;
}

function ModeBadge({ mode, officialTournamentName, officialRound, opponentName, result }: { mode?: LogMode; officialTournamentName?: string; officialRound?: string; opponentName?: string; result?: "win" | "loss" }) {
  const matchDetails = [result ? (result === "win" ? "勝ち" : "負け") : undefined, opponentName ? `vs ${opponentName}` : undefined];
  const details = mode === "official" ? [officialTournamentName, officialRound, ...matchDetails].filter(Boolean) : matchDetails.filter(Boolean);
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${getModeBadgeStyle(mode)}`}>{[getModeLabel(mode), ...details].join(" / ")}</span>;
}

function DisciplineBadge({ discipline, compact = false }: { discipline: Discipline; compact?: boolean }) {
  const label = compact && discipline === "International Names" ? "Inter" : discipline;
  return <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-black" title={discipline} style={getDisciplineBadgeStyle(discipline)}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: DISCIPLINE_COLORS[discipline] }} />{label}</span>;
}

function getDisciplineBadgeStyle(discipline: Discipline): React.CSSProperties {
  const color = DISCIPLINE_COLORS[discipline];
  return {
    backgroundColor: `${color}1F`,
    borderColor: `${color}80`,
    color,
  };
}

function getDisciplineCardStyle(discipline: Discipline): React.CSSProperties {
  const color = DISCIPLINE_COLORS[discipline];
  return {
    borderColor: `${color}66`,
    borderLeftColor: color,
    borderLeftWidth: 6,
    backgroundColor: `${color}0D`,
  };
}

function Page({ children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-100"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-100"><div className="text-xs font-semibold text-zinc-500">{label}</div><div className="mt-2 break-words text-2xl font-black">{value}</div><p className="mt-2 text-sm text-zinc-600">{detail}</p></div>;
}

function StatsGrid({ stats }: { stats: ReturnType<typeof getDisciplineStats> }) {
  const t = useT();
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{stats.map((item) => <div key={item.discipline} className="rounded-lg border bg-zinc-50 p-4" style={getDisciplineCardStyle(item.discipline)}><div className="flex items-center justify-between gap-3"><DisciplineBadge discipline={item.discipline} /><span className="text-sm font-semibold">{item.attempts}回</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><MiniMetric label={t("successRate")} value={percent(item.successRate)} /><MiniMetric label={t("averageTime")} value={`${formatTime(item.averageTime)}秒`} /><MiniMetric label={t("averageScore")} value={record(item.averageScore)} /><MiniMetric label={t("stability")} value={percent(item.stability)} /></div></div>)}</div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-white p-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 break-words font-bold">{value}</div></div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid gap-1 text-sm font-medium text-zinc-700 ${className}`}>{label}{children}</label>;
}

function SelfRatingButtons({ value, onChange, compact = false }: { value: SelfRating | null; onChange: (value: SelfRating | null) => void; compact?: boolean }) {
  const t = useT();
  const styles: Record<SelfRating, string> = {
    good: "border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200",
    neutral: "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200",
    bad: "border-rose-300 text-rose-800 dark:border-rose-700 dark:text-rose-200",
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("selfRating")}>
      {SELF_RATINGS.map((rating) => (
        <button
          key={rating}
          type="button"
          aria-pressed={value === rating}
          aria-label={`${t("selfRating")}: ${SELF_RATING_SYMBOLS[rating]} ${rating}`}
          title={`${SELF_RATING_SYMBOLS[rating]} ${rating}`}
          onClick={() => onChange(value === rating ? null : rating)}
          className={`${compact ? "h-8 min-w-8 px-2 text-base" : "h-11 min-w-12 px-3 text-xl"} rounded-md border bg-white font-black transition dark:bg-zinc-900 ${styles[rating]} ${value === rating ? "ring-2 ring-zinc-950 ring-offset-1 dark:ring-white dark:ring-offset-zinc-900" : "opacity-70 hover:opacity-100"}`}
        >
          {SELF_RATING_SYMBOLS[rating]}
        </button>
      ))}
      {!compact && <span className="text-xs text-zinc-500 dark:text-zinc-400">{value ? `${SELF_RATING_SYMBOLS[value]} ${value}` : t("notRated")}</span>}
    </div>
  );
}

function SelfRatingDisplay({ value }: { value: SelfRating | null }) {
  const t = useT();
  if (!value) return <span className="text-xs text-zinc-400">{t("notRated")}</span>;
  const color = value === "good" ? "text-emerald-700 dark:text-emerald-300" : value === "neutral" ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300";
  return <span className={`text-lg font-black ${color}`} title={value}>{SELF_RATING_SYMBOLS[value]}</span>;
}

function NumberField({ label, value, onChange, placeholder, step = "1" }: { label: string; value: number | ""; onChange: (value: number | "") => void; placeholder?: string; step?: string }) {
  return <Field label={label}><input className="input" type="number" min="0" step={step} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></Field>;
}

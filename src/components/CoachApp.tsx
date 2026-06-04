"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildMatchPlan,
  calculateEventStats,
  daysUntil,
  generatePracticeMenu,
  getAnalyticsFilterState,
  getAvailableMonths,
  getDisciplineStats,
  getDisciplineTone,
  getDisciplineWindowStats,
  getRecentTrend,
  getWeeklyReview,
  percent,
  record,
} from "@/lib/analytics";
import { sampleData } from "@/lib/sample-data";
import { CoachData, Discipline, DISCIPLINES, LOG_MODES, LogMode, Opponent, PracticeLog, Tournament } from "@/lib/types";
import {
  deletePracticeLog,
  getModeBadgeStyle,
  getModeLabel,
  isSuccessfulLog,
  normalizeMemoryLeagueLog,
  normalizeStoredLog,
  parseMemoryLeagueImportText,
  saveTournaments,
  getNextTournament,
  updatePracticeLogInline,
} from "@/app/shared";

type View = "dashboard" | "practice" | "analytics" | "opponents" | "match-plan" | "weekly-review" | "settings" | "import";
type NumberInputValue = number | "";
type EventFilter = Discipline | "all";
type PeriodFilter = "all" | "7" | "30" | "90" | "custom" | `month:${string}`;
type PracticeLogFormState = {
  date: string;
  discipline: Discipline;
  mode: LogMode;
  score: NumberInputValue;
  time: NumberInputValue;
  memo: string;
};

const storageKey = "memory-league-coach:data:v1";
const todayIso = () => new Date().toISOString().slice(0, 10);

const navItems: { href: string; label: string; view: View }[] = [
  { href: "/dashboard", label: "ダッシュボード", view: "dashboard" },
  { href: "/practice", label: "練習入力", view: "practice" },
  { href: "/analytics", label: "分析", view: "analytics" },
  { href: "/opponents", label: "対戦相手", view: "opponents" },
  { href: "/match-plan", label: "対戦プラン", view: "match-plan" },
  { href: "/weekly-review", label: "週次レビュー", view: "weekly-review" },
  { href: "/settings", label: "設定", view: "settings" },
];

const emptyLog = (): PracticeLogFormState => ({
  date: todayIso(),
  discipline: "Cards",
  mode: "train",
  score: "",
  time: "",
  memo: "",
});

const emptyOpponent = (): Omit<Opponent, "id"> => ({
  name: "",
  averages: { Cards: 30, Images: 50, "International Names": 90, Names: 75, Numbers: 80, Words: 65 },
  successRates: { Cards: 75, Images: 75, "International Names": 75, Names: 75, Numbers: 75, Words: 75 },
  memo: "",
});

const emptyTournament = (): Omit<Tournament, "id"> => ({
  name: "",
  date: todayIso(),
  goal: "",
  memo: "",
});

function migrateTournaments(data: CoachData): Tournament[] {
  if (data.tournaments?.length) return data.tournaments;
  if (!data.settings.tournamentDate && !data.settings.tournamentName) return sampleData.tournaments ?? [];
  return [{ id: "legacy-tournament", name: data.settings.tournamentName || "大会", date: data.settings.tournamentDate, goal: "", memo: "" }];
}

function useCoachData() {
  const [data, setData] = useState<CoachData>(sampleData);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let nextData = sampleData;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CoachData;
        nextData = {
          ...parsed,
          tournaments: migrateTournaments(parsed),
          logs: parsed.logs.map(normalizeStoredLog),
          settings: { ...sampleData.settings, ...parsed.settings },
        };
      } catch {
        nextData = sampleData;
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
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, mounted]);

  return { data, setData, mounted };
}

export function CoachApp({ view }: { view: View }) {
  const { data, setData, mounted } = useCoachData();
  const logs = useMemo(() => data.logs.map(normalizeStoredLog), [data.logs]);
  const stats = useMemo(() => getDisciplineStats(logs), [logs]);
  const trend = useMemo(() => getRecentTrend(logs), [logs]);
  const nextOpponent = data.opponents.find((opponent) => opponent.id === data.settings.nextOpponentId);

  const addLogs = (newLogs: Omit<PracticeLog, "id">[]) => {
    setData((current) => ({
      ...current,
      logs: [...newLogs.map((log) => ({ ...log, id: crypto.randomUUID() })), ...current.logs.map(normalizeStoredLog)],
    }));
  };
  const updateLog = (log: PracticeLog) => setData((current) => ({ ...current, logs: updatePracticeLogInline(current.logs, log) }));
  const removeLog = (id: string) => setData((current) => ({ ...current, logs: deletePracticeLog(current.logs, id) }));
  const addOpponent = (opponent: Omit<Opponent, "id">) => setData((current) => ({ ...current, opponents: [{ ...opponent, id: crypto.randomUUID() }, ...current.opponents] }));
  const setTournaments = (tournaments: Tournament[]) => setData((current) => saveTournaments(current, tournaments));

  const normalizedData = { ...data, logs, tournaments: data.tournaments ?? [] };
  const content = {
    dashboard: <Dashboard data={normalizedData} stats={stats} trend={trend} opponent={nextOpponent} mounted={mounted} onAdd={(log) => addLogs([log])} />,
    practice: <Practice logs={logs} onAdd={(log) => addLogs([log])} onUpdate={updateLog} onDelete={removeLog} />,
    import: <ImportPage onImport={addLogs} />,
    analytics: <Analytics logs={logs} />,
    opponents: <Opponents opponents={data.opponents} onAdd={addOpponent} />,
    "match-plan": <MatchPlan data={normalizedData} setData={setData} />,
    "weekly-review": <WeeklyReview logs={logs} />,
    settings: <SettingsView data={normalizedData} setData={setData} setTournaments={setTournaments} />,
  }[view];

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-950 text-sm font-black text-white">ML</span>
              <span>
                <span className="block text-base font-bold">Memory League Coach</span>
                <span className="block text-xs text-zinc-500">勝つための練習ログと対戦準備</span>
              </span>
            </Link>
            <div className="hidden rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-xs text-zinc-600 sm:block">
              直近7日 <span className="font-semibold text-zinc-950">{mounted ? `${trend.attempts}回` : "--"}</span>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${view === item.view ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{content}</main>
    </div>
  );
}

function Dashboard({ data, stats, trend, opponent, mounted, onAdd }: { data: CoachData; stats: ReturnType<typeof getDisciplineStats>; trend: ReturnType<typeof getRecentTrend>; opponent?: Opponent; mounted: boolean; onAdd: (log: Omit<PracticeLog, "id">) => void }) {
  const nextTournament = getNextTournament(data.tournaments ?? []);
  const until = daysUntil(nextTournament?.date ?? data.settings.tournamentDate);
  const practiceMenu = generatePracticeMenu(data.logs);
  const latest = data.logs.slice(0, 5);
  const tournamentLabel = nextTournament?.name ? `${nextTournament.name}まで` : data.settings.tournamentName ? `${data.settings.tournamentName}まで` : "大会まで";

  return (
    <Page title="ダッシュボード" subtitle="毎日の入力と、今日やる練習メニューをここに集約します。">
      <Panel title="今日の練習メニュー">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {practiceMenu.map((item) => (
              <div key={item.discipline} className={`rounded-lg border p-4 ${getDisciplineTone(item.discipline)}`}>
                <div className="text-lg font-black">{item.discipline}</div>
                <div className="mt-2 text-3xl font-black">{item.count}回</div>
                <p className="mt-2 text-sm">{item.reason}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold text-zinc-500">{tournamentLabel}</div>
            <div className="mt-2 text-5xl font-black">{until === null ? "-" : Math.max(0, until)}</div>
            <p className="mt-2 text-sm text-zinc-600">{(nextTournament?.date ?? data.settings.tournamentDate) || "設定で大会日を入力してください。"}</p>
          </div>
        </div>
      </Panel>
      <Panel title="今日の練習入力"><DailyLogForm onAdd={onAdd} /></Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Metric label="直近の調子" value={mounted ? `${trend.attempts}回` : "--"} detail={mounted ? `${trend.successes}成功 / 直近7日` : "直近7日"} />
        <Metric label="次の対戦相手" value={opponent?.name ?? "未設定"} detail="対戦プランで相手別の練習方針を確認" />
        <Metric label="今日の合計" value={`${practiceMenu.reduce((sum, item) => sum + item.count, 0)}回`} detail="苦手種目、成功率、直近回数から配分" />
      </div>
      <Panel title="最近の記録"><LogList logs={latest} /></Panel>
      <Panel title="分析"><StatsGrid stats={stats} /></Panel>
    </Page>
  );
}

function Practice({ logs, onAdd, onUpdate, onDelete }: { logs: PracticeLog[]; onAdd: (log: Omit<PracticeLog, "id">) => void; onUpdate: (log: PracticeLog) => void; onDelete: (id: string) => void }) {
  return (
    <Page title="練習入力" subtitle="Memory Leagueの1記録を、モードに応じた順番で入力します。">
      <Panel title="日次ログ入力"><DailyLogForm onAdd={onAdd} /></Panel>
      <EditableLogsTable logs={logs} onUpdate={onUpdate} onDelete={onDelete} />
    </Page>
  );
}

function DailyLogForm({ onAdd }: { onAdd: (log: Omit<PracticeLog, "id">) => void }) {
  const [form, setForm] = useState<PracticeLogFormState>(emptyLog);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onAdd(normalizeMemoryLeagueLog({ ...form, score: form.score === "" ? undefined : form.score, time: form.time === "" ? undefined : form.time }));
    setForm(emptyLog());
  };
  const scoreField = <NumberField label="スコア" value={form.score} onChange={(score) => setForm({ ...form, score })} placeholder="例: 52" />;
  const timeField = <NumberField label="タイム" value={form.time} onChange={(time) => setForm({ ...form, time })} placeholder="例: 48.07" step="0.01" />;

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
      <Field label="日付"><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
      <Field label="種目">
        <select className="input" value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value as Discipline })}>
          {DISCIPLINES.map((discipline) => <option key={discipline}>{discipline}</option>)}
        </select>
      </Field>
      <Field label="モード">
        <select className="input" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as LogMode })}>
          {LOG_MODES.map((mode) => <option key={mode} value={mode}>{getModeLabel(mode)}</option>)}
        </select>
      </Field>
      {form.mode === "train" ? <>{scoreField}{timeField}</> : <>{timeField}{scoreField}</>}
      <Field label="メモ" className="md:col-span-4">
        <textarea className="input min-h-32 resize-y leading-6" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} placeholder={"・どこでミスしたか\n・何が上手くいったか\n・次回試したいこと"} rows={5} />
      </Field>
      <button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white md:col-span-4">記録を追加</button>
    </form>
  );
}

function ImportPage({ onImport }: { onImport: (logs: Omit<PracticeLog, "id">[]) => void }) {
  const [mode, setMode] = useState<LogMode>("rated");
  const [discipline, setDiscipline] = useState<Discipline>("Cards");
  const [date, setDate] = useState(todayIso());
  const [text, setText] = useState("Time: 48.07s\nScore: 52\n\nTime: 51.20s\nScore: 50");
  const [imported, setImported] = useState(0);
  const result = useMemo(() => parseMemoryLeagueImportText({ text, mode, discipline, date }), [date, discipline, mode, text]);
  const importLogs = () => {
    if (result.logs.length === 0 || result.errors.length > 0) return;
    onImport(result.logs.map((log) => normalizeMemoryLeagueLog({ ...log, memo: "Memory League貼り付けから取り込み" })));
    setImported(result.logs.length);
    setText("");
  };

  return (
    <Page title="インポート" subtitle="Memory Leagueの結果画面からコピーしたテキストを貼り付けて取り込みます。MVPでは手入力がメイン導線です。">
      <Panel title="インポート設定">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="モード"><select className="input" value={mode} onChange={(event) => setMode(event.target.value as LogMode)}>{LOG_MODES.map((item) => <option key={item} value={item}>{getModeLabel(item)}</option>)}</select></Field>
          <Field label="種目"><select className="input" value={discipline} onChange={(event) => setDiscipline(event.target.value as Discipline)}>{DISCIPLINES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="日付"><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        </div>
        <Field label="貼り付けテキスト"><textarea className="input mt-4 min-h-56 font-mono text-sm" value={text} onChange={(event) => { setImported(0); setText(event.target.value); }} placeholder={mode === "train" ? "Score: 0\nTime: 0.69 sec" : "Time: 48.07s\nScore: 52"} /></Field>
      </Panel>
      {result.errors.length > 0 && <Panel title="エラー"><ul className="grid gap-2 text-sm text-rose-700">{result.errors.map((error) => <li key={error} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">{error}</li>)}</ul></Panel>}
      <Panel title="プレビュー">
        {result.logs.length === 0 ? <p className="text-sm text-zinc-600">まだ記録を読み取れていません。</p> : <LogList logs={result.logs.map((log, index) => ({ ...normalizeMemoryLeagueLog(log), id: `preview-${index}` }))} />}
        <button onClick={importLogs} disabled={result.logs.length === 0 || result.errors.length > 0} className="mt-4 h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300">取り込む</button>
        {imported > 0 && <p className="mt-3 text-sm font-semibold text-emerald-700">{imported}件を取り込みました。</p>}
      </Panel>
    </Page>
  );
}

function Analytics({ logs }: { logs: PracticeLog[] }) {
  const [modeFilter, setModeFilter] = useState<LogMode | "all">("all");
  const [selectedEvent, setSelectedEvent] = useState<EventFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const months = useMemo(() => getAvailableMonths(logs), [logs]);
  const filteredLogs = useMemo(() => getAnalyticsFilterState({ logs, mode: modeFilter, discipline: selectedEvent, period, customFrom, customTo }), [customFrom, customTo, logs, modeFilter, period, selectedEvent]);
  const eventCards = useMemo(() => DISCIPLINES.map((discipline) => calculateEventStats(discipline, filteredLogs)), [filteredLogs]);
  const selectedStats = selectedEvent === "all" ? undefined : calculateEventStats(selectedEvent, filteredLogs);
  const selectedWindowStats = selectedEvent === "all" ? [] : getDisciplineWindowStats(filteredLogs).filter((item) => item.discipline === selectedEvent);

  return (
    <Page title="分析" subtitle="フィルタ、種目別分析、ログ一覧の順に確認します。">
      <Panel title="フィルタ">
        <FilterButtons label="種目" items={[{ value: "all", label: "全種目" }, ...DISCIPLINES.map((discipline) => ({ value: discipline, label: discipline }))]} value={selectedEvent} onChange={(value) => setSelectedEvent(value as EventFilter)} />
        <FilterButtons label="期間" items={[{ value: "all", label: "全期間" }, { value: "7", label: "7日" }, { value: "30", label: "30日" }, { value: "90", label: "90日" }, ...months.map((month) => ({ value: `month:${month}`, label: formatMonth(month) })), { value: "custom", label: "カスタム" }]} value={period} onChange={(value) => setPeriod(value as PeriodFilter)} />
        {period === "custom" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="開始日"><input className="input" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></Field><Field label="終了日"><input className="input" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></Field></div>}
        <FilterButtons label="モード" items={[{ value: "all", label: "All" }, ...LOG_MODES.map((mode) => ({ value: mode, label: getModeLabel(mode) }))]} value={modeFilter} onChange={(value) => setModeFilter(value as LogMode | "all")} />
      </Panel>
      {filteredLogs.length === 0 ? (
        <Panel title="分析"><p className="text-sm text-zinc-600">この期間のログがありません。</p></Panel>
      ) : selectedEvent === "all" ? (
        <>
          <Panel title="各種目分析"><EventStatsGrid stats={eventCards} /></Panel>
          <Panel title="全ログ一覧"><LogList logs={filteredLogs} /></Panel>
        </>
      ) : (
        <>
          <Panel title={`${selectedEvent} の種目別分析`}>
            <EventStatsGrid stats={selectedStats ? [selectedStats] : []} />
            <div className="mt-4"><DisciplineWindowGrid data={selectedWindowStats} /></div>
          </Panel>
          <Panel title={`${selectedEvent} のログ一覧`}><LogList logs={filteredLogs} /></Panel>
        </>
      )}
    </Page>
  );
}

function Opponents({ opponents, onAdd }: { opponents: Opponent[]; onAdd: (opponent: Omit<Opponent, "id">) => void }) {
  const [form, setForm] = useState(emptyOpponent);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onAdd(form);
    setForm(emptyOpponent());
  };
  return (
    <Page title="対戦相手" subtitle="相手の平均タイムと成功率を管理し、対戦プランに使います。">
      <Panel title="対戦相手入力">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="選手名"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="選手名" /></Field>
          <div className="grid gap-3 md:grid-cols-3">{DISCIPLINES.map((discipline) => <div key={discipline} className="rounded-lg border border-zinc-200 p-3"><div className="font-semibold">{discipline}</div><NumberField label="平均タイム" value={form.averages[discipline]} onChange={(value) => setForm({ ...form, averages: { ...form.averages, [discipline]: value === "" ? 0 : value } })} step="0.1" /><NumberField label="成功率" value={form.successRates[discipline]} onChange={(value) => setForm({ ...form, successRates: { ...form.successRates, [discipline]: value === "" ? 0 : value } })} step="1" /></div>)}</div>
          <Field label="メモ"><textarea className="input min-h-24" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field>
          <button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white">対戦相手を追加</button>
        </form>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">{opponents.map((opponent) => <Panel key={opponent.id} title={opponent.name}><div className="grid gap-2 sm:grid-cols-2">{DISCIPLINES.map((discipline) => <div key={discipline} className="flex justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm"><span>{discipline}</span><span className="font-semibold">{record(opponent.averages[discipline])}秒 / {percent(opponent.successRates[discipline])}</span></div>)}</div><p className="mt-4 text-sm text-zinc-600">{opponent.memo}</p></Panel>)}</div>
    </Page>
  );
}

function MatchPlan({ data, setData }: { data: CoachData; setData: React.Dispatch<React.SetStateAction<CoachData>> }) {
  const opponent = data.opponents.find((item) => item.id === data.settings.nextOpponentId) ?? data.opponents[0];
  const plan = buildMatchPlan(data.logs, opponent);
  return (
    <Page title="対戦プラン" subtitle="自分の記録と相手の傾向を比較し、試合で取りに行く方針を作ります。">
      <Panel title="対戦相手"><select className="input max-w-md" value={opponent?.id ?? ""} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, nextOpponentId: event.target.value } }))}>{data.opponents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Panel>
      <div className="grid gap-4 md:grid-cols-4"><Metric label="取りに行く種目" value={plan.targets.join(" / ") || "-"} detail="自分の優位が高い種目" /><Metric label="警戒する種目" value={plan.warnings.join(" / ") || "-"} detail="相手優位、または成功率に注意" /><Metric label="優先度を下げる種目" value={plan.discardable.join(" / ") || "なし"} detail="無理に取りに行かない候補" /><Metric label="試合前メニュー" value={plan.menu.join(" / ")} detail="短時間で整える順番" /></div>
      <Panel title="練習方針"><p className="text-lg font-semibold">{plan.winLine}</p></Panel>
      <Panel title="種目別比較"><div className="grid gap-3">{plan.comparison.map((item) => <div key={item.discipline} className="rounded-lg border border-zinc-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-bold">{item.discipline}</div><div className={item.edge >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>Edge {item.edge.toFixed(1)}</div></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div>自分 平均タイム {record(item.averageTime)}秒 / 成功率 {percent(item.successRate)}</div><div>相手 平均タイム {record(item.opponentAverage)}秒 / 成功率 {percent(item.opponentSuccessRate)}</div></div></div>)}</div></Panel>
    </Page>
  );
}

function WeeklyReview({ logs }: { logs: PracticeLog[] }) {
  const review = getWeeklyReview(logs);
  return (
    <Page title="週次レビュー" subtitle="直近7日を振り返り、来週の重点種目を決めます。">
      <div className="grid gap-4 md:grid-cols-4"><Metric label="今週の回数" value={`${review.attempts}回`} detail="直近7日" /><Metric label="最も改善した種目" value={review.improved} detail="成功率の前週比" /><Metric label="失敗率が高い種目" value={review.worstFailure} detail="次の修正候補" /><Metric label="来週の重点種目" value={review.focus.join(" / ")} detail="先にログを増やす種目" /></div>
      <Panel title="来週の練習方針"><div className="grid gap-3 md:grid-cols-3">{review.focus.map((discipline) => <div key={discipline} className={`rounded-lg border p-4 ${getDisciplineTone(discipline)}`}><div className="text-lg font-bold">{discipline}</div><p className="mt-2 text-sm">毎日2から3回。スピードより先に成功率を戻します。</p></div>)}<div className="rounded-lg border border-zinc-200 bg-white p-4"><div className="text-lg font-bold">レビュー観点</div><p className="mt-2 text-sm text-zinc-600">失敗ログを見返し、繰り返している原因を1つだけ潰します。</p></div></div></Panel>
    </Page>
  );
}

function SettingsView({ data, setData, setTournaments }: { data: CoachData; setData: React.Dispatch<React.SetStateAction<CoachData>>; setTournaments: (tournaments: Tournament[]) => void }) {
  const reset = () => setData(sampleData);
  const tournaments = data.tournaments ?? [];
  const [editingTournamentId, setEditingTournamentId] = useState<string | undefined>();
  const [form, setForm] = useState(emptyTournament);
  const submitTournament = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.date) return;
    if (editingTournamentId) {
      setTournaments(tournaments.map((tournament) => (tournament.id === editingTournamentId ? { ...tournament, ...form } : tournament)));
      setEditingTournamentId(undefined);
    } else {
      setTournaments([{ ...form, id: crypto.randomUUID() }, ...tournaments]);
    }
    setForm(emptyTournament());
  };
  const startTournamentEdit = (tournament: Tournament) => {
    setEditingTournamentId(tournament.id);
    setForm({ name: tournament.name, date: tournament.date, goal: tournament.goal ?? "", memo: tournament.memo ?? "" });
  };
  const removeTournament = (id: string) => {
    if (window.confirm("この大会を削除しますか？")) setTournaments(tournaments.filter((tournament) => tournament.id !== id));
  };
  return (
    <Page title="設定" subtitle="大会情報、次の対戦相手、ローカルデータを管理します。">
      <Panel title={editingTournamentId ? "大会を編集" : "大会を追加"}><form onSubmit={submitTournament} className="grid gap-4 md:grid-cols-2"><Field label="大会名"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例: 日本大会" /></Field><Field label="大会日"><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="目標"><input className="input" value={form.goal ?? ""} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="例: Cardsを安定して取る" /></Field><Field label="メモ"><textarea className="input min-h-24 resize-y" value={form.memo ?? ""} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field><div className="flex flex-col gap-2 md:col-span-2 sm:flex-row"><button className="h-11 rounded-md bg-zinc-950 px-4 font-semibold text-white">{editingTournamentId ? "保存する" : "大会を追加"}</button>{editingTournamentId && <button type="button" onClick={() => { setEditingTournamentId(undefined); setForm(emptyTournament()); }} className="h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">キャンセル</button>}</div></form></Panel>
      <Panel title="大会一覧">{tournaments.length === 0 ? <p className="text-sm text-zinc-600">大会が登録されていません。</p> : <div className="grid gap-3 md:grid-cols-2">{tournaments.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((tournament) => <article key={tournament.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black">{tournament.name}</div><div className="mt-1 text-sm text-zinc-600">{tournament.date}</div></div><div className="flex gap-2"><button onClick={() => startTournamentEdit(tournament)} className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-semibold hover:bg-white">編集</button><button onClick={() => removeTournament(tournament.id)} className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50">削除</button></div></div>{tournament.goal && <p className="mt-3 text-sm font-semibold">目標: {tournament.goal}</p>}{tournament.memo && <p className="mt-2 text-sm text-zinc-600">{tournament.memo}</p>}</article>)}</div>}</Panel>
      <Panel title="基本設定"><div className="grid gap-4 md:grid-cols-2"><Field label="プレイヤー名"><input className="input" value={data.settings.playerName} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, playerName: event.target.value } }))} /></Field><Field label="次の対戦相手"><select className="input" value={data.settings.nextOpponentId} onChange={(event) => setData((current) => ({ ...current, settings: { ...current.settings, nextOpponentId: event.target.value } }))}>{data.opponents.map((opponent) => <option key={opponent.id} value={opponent.id}>{opponent.name}</option>)}</select></Field></div></Panel>
      <Panel title="データ"><p className="text-sm text-zinc-600">データはブラウザのlocalStorageに保存されます。DB、OpenAI API、自動ログイン、外部保存は使っていません。</p><button onClick={reset} className="mt-4 h-11 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">サンプルデータに戻す</button></Panel>
    </Page>
  );
}

function EditableLogsTable({ logs, onUpdate, onDelete }: { logs: PracticeLog[]; onUpdate: (log: PracticeLog) => void; onDelete: (id: string) => void }) {
  const [editingId, setEditingId] = useState<string | undefined>();
  const [draft, setDraft] = useState<PracticeLogFormState>(emptyLog);
  const startEdit = (log: PracticeLog) => {
    setEditingId(log.id);
    setDraft({ date: log.date, discipline: log.discipline, mode: log.mode ?? "train", score: log.score ?? "", time: log.time ?? "", memo: log.memo });
  };
  const save = (id: string) => {
    const normalized = normalizeMemoryLeagueLog({ ...draft, score: draft.score === "" ? undefined : draft.score, time: draft.time === "" ? undefined : draft.time });
    onUpdate({ ...normalized, id });
    setEditingId(undefined);
  };
  const confirmDelete = (id: string) => {
    if (window.confirm("このログを削除しますか？")) onDelete(id);
  };
  return (
    <Panel title="最近の記録">
      <div className="grid gap-3">
        {logs.map((log) => {
          const isEditing = editingId === log.id;
          return (
            <article key={log.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(7rem,0.8fr)_minmax(6rem,0.7fr)_minmax(7rem,0.7fr)] md:items-end">
                    <Field label="日付"><input className="input w-full" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field>
                    <div>
                      <div className="mb-1 text-xs font-bold text-zinc-500">種目</div>
                      <div className="flex h-11 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold">{log.discipline}</div>
                    </div>
                    <Field label="Mode"><select className="input w-full" value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as LogMode })}>{LOG_MODES.map((mode) => <option key={mode} value={mode}>{getModeLabel(mode)}</option>)}</select></Field>
                    <NumberField label="Score" value={draft.score} onChange={(score) => setDraft({ ...draft, score })} placeholder="例: 52" />
                    <NumberField label="Time" value={draft.time} onChange={(time) => setDraft({ ...draft, time })} placeholder="例: 48.07" step="0.01" />
                  </div>
                  <Field label="メモ"><textarea className="input min-h-24 resize-y" value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></Field>
                  <div className="flex flex-wrap gap-2"><button onClick={() => save(log.id)} className="h-10 rounded-md bg-zinc-950 px-4 font-semibold text-white">保存</button><button onClick={() => setEditingId(undefined)} className="h-10 rounded-md border border-zinc-300 px-4 font-semibold hover:bg-zinc-50">キャンセル</button></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <LogRecordGrid log={log} />
                  <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700"><span className="font-bold text-zinc-950">メモ：</span>{log.memo || "-"}</div>
                  <div className="flex flex-wrap gap-2"><button onClick={() => startEdit(log)} className="rounded-md border border-zinc-300 px-3 py-1 font-semibold hover:bg-zinc-50">編集</button><button onClick={() => confirmDelete(log.id)} className="rounded-md border border-rose-300 px-3 py-1 font-semibold text-rose-700 hover:bg-rose-50">削除</button></div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function LogList({ logs }: { logs: PracticeLog[] }) {
  return <div className="grid gap-3">{logs.map((log) => <article key={log.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><LogRecordGrid log={log} /><div className="mt-3 rounded-md bg-white p-3 text-sm text-zinc-700"><span className="font-bold text-zinc-950">メモ：</span>{log.memo || "-"}</div></article>)}</div>;
}

function LogRecordGrid({ log }: { log: PracticeLog }) {
  const itemClass = "min-w-0";
  const labelClass = "mb-1 text-xs font-bold text-zinc-500";
  const valueClass = "truncate text-sm font-semibold text-zinc-950";
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(7rem,0.8fr)_minmax(6rem,0.7fr)_minmax(7rem,0.7fr)_minmax(5rem,0.6fr)] md:items-center">
      <div className={itemClass}><div className={labelClass}>日付</div><div className={valueClass}>{log.date}</div></div>
      <div className={itemClass}><div className={labelClass}>種目</div><div className={valueClass}>{log.discipline}</div></div>
      <div className={itemClass}><div className={labelClass}>Mode</div><ModeBadge mode={log.mode} /></div>
      <div className={itemClass}><div className={labelClass}>Score</div><div className={valueClass}>{log.score ?? 0}</div></div>
      <div className={itemClass}><div className={labelClass}>Time</div><div className={valueClass}>{record(log.time ?? 0)}s</div></div>
      <div className={itemClass}><div className={labelClass}>判定</div><div className={valueClass}>{isSuccessfulLog(log) ? "成功" : "失敗"}</div></div>
    </div>
  );
}

function EventStatsGrid({ stats }: { stats: ReturnType<typeof getDisciplineStats> }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{stats.map((item) => <div key={item.discipline} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><h3 className="font-black">{item.discipline}</h3><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><MiniMetric label="練習回数" value={`${item.attempts}回`} /><MiniMetric label="平均スコア" value={record(item.averageScore)} /><MiniMetric label="平均タイム" value={`${record(item.averageTime)}秒`} /><MiniMetric label="成功率" value={percent(item.successRate)} /><MiniMetric label="ベストスコア" value={record(item.bestScore)} /><MiniMetric label="ベストタイム" value={`${record(item.bestTime)}秒`} /></div></div>)}</div>;
}

function DisciplineWindowGrid({ data }: { data: ReturnType<typeof getDisciplineWindowStats> }) {
  return <div className="grid gap-4">{data.map((item) => <section key={item.discipline} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><h3 className="text-lg font-black">{item.discipline}</h3><div className="mt-4 grid gap-3 xl:grid-cols-4">{item.windows.map((window) => <div key={window.size} className="rounded-lg border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><div className="font-bold">直近{window.size}回</div>{!window.isEnoughData && <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">データ不足</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><MiniMetric label="平均スコア" value={window.isEnoughData ? record(window.averageScore) : "-"} /><MiniMetric label="平均タイム" value={window.isEnoughData ? `${record(window.averageTime)}秒` : "-"} /><MiniMetric label="成功率" value={window.isEnoughData ? percent(window.successRate) : "-"} /><MiniMetric label="安定度" value={window.isEnoughData ? percent(window.stability) : "-"} /><MiniMetric label="ベストスコア" value={window.isEnoughData ? record(window.bestScore) : "-"} /><MiniMetric label="ベストタイム" value={window.isEnoughData ? `${record(window.bestTime)}秒` : "-"} /></div></div>)}</div></section>)}</div>;
}

function FilterButtons({ label, items, value, onChange }: { label: string; items: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <div className="mt-3"><div className="mb-2 text-sm font-bold text-zinc-700">{label}</div><div className="flex flex-wrap gap-2">{items.map((item) => <button key={item.value} onClick={() => onChange(item.value)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${value === item.value ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{item.label}</button>)}</div></div>;
}

function formatMonth(month: string) {
  const [year, rawMonth] = month.split("-");
  return `${year}年${Number(rawMonth)}月`;
}

function ModeBadge({ mode }: { mode?: LogMode }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${getModeBadgeStyle(mode)}`}>{getModeLabel(mode)}</span>;
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="space-y-5"><section className="rounded-xl border border-zinc-200 bg-white p-5"><h1 className="text-2xl font-black tracking-normal sm:text-3xl">{title}</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">{subtitle}</p></section>{children}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-100"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-100"><div className="text-xs font-semibold text-zinc-500">{label}</div><div className="mt-2 break-words text-2xl font-black">{value}</div><p className="mt-2 text-sm text-zinc-600">{detail}</p></div>;
}

function StatsGrid({ stats }: { stats: ReturnType<typeof getDisciplineStats> }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{stats.map((item) => <div key={item.discipline} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{item.discipline}</h3><span className="text-sm font-semibold">{item.attempts}回</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><MiniMetric label="成功率" value={percent(item.successRate)} /><MiniMetric label="平均タイム" value={`${record(item.averageTime)}秒`} /><MiniMetric label="平均スコア" value={record(item.averageScore)} /><MiniMetric label="安定度" value={percent(item.stability)} /></div></div>)}</div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-white p-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 break-words font-bold">{value}</div></div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid gap-1 text-sm font-medium text-zinc-700 ${className}`}>{label}{children}</label>;
}

function NumberField({ label, value, onChange, placeholder, step = "1" }: { label: string; value: number | ""; onChange: (value: number | "") => void; placeholder?: string; step?: string }) {
  return <Field label={label}><input className="input" type="number" min="0" step={step} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></Field>;
}

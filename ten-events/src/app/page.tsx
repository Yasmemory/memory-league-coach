import Link from "next/link";
import { viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { JournalRow } from "@/components/JournalRow";

export const dynamic = "force-dynamic";
type Params = { event?: string; page?: string; student?: string; show?: string };
export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await viewer();
  if (!user) return <main className="login"><h1>練習記録と振り返り</h1><p>Discordで報告した結果を、種目ごとに振り返れます。</p><a className="button" href="/api/auth/discord">Discordでログイン</a></main>;
  const query = await searchParams;
  const prisma = db();
  const requestedStudent = user.isCoach && typeof query.student === "string" ? query.student : user.student.id;
  const selectedStudent = user.isCoach ? await prisma.student.findUnique({ where: { id: requestedStudent } }) : user.student;
  const studentId = selectedStudent?.id ?? user.student.id;
  const event = typeof query.event === "string" ? query.event.slice(0, 120) : "";
  const page = Math.min(10000, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const showCancelled = query.show === "all";
  const where = { studentId, ...(event ? { event } : {}), ...(showCancelled ? {} : { status: "有効" }) };
  const [events, total, records, students] = await Promise.all([
    prisma.practiceRecord.findMany({ where: { studentId, ...(showCancelled ? {} : { status: "有効" }) }, select: { event: true }, distinct: ["event"], orderBy: { event: "asc" } }),
    prisma.practiceRecord.count({ where }),
    prisma.practiceRecord.findMany({ where, orderBy: [{ practicedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 30, take: 30 }),
    user.isCoach ? prisma.student.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : Promise.resolve([]),
  ]);
  const queryString = (values: Record<string, string>) => {
    const p = new URLSearchParams();
    if (event) p.set("event", event);
    if (user.isCoach) p.set("student", studentId);
    if (showCancelled) p.set("show", "all");
    for (const [k, v] of Object.entries(values)) v ? p.set(k, v) : p.delete(k);
    return "/?" + p.toString();
  };
  return <main className="shell">
    <header><div><span className="eyebrow">MEMORY SPORTS / JOURNAL</span><h1>練習記録</h1><p>{selectedStudent?.displayName ?? user.student.displayName} の記録と振り返り</p></div><form action="/api/auth/logout" method="post"><button className="subtle">ログアウト</button></form></header>
    {user.isCoach && <nav className="students" aria-label="生徒一覧">{students.map(s => <Link key={s.id} className={s.id === studentId ? "selected" : ""} href={queryString({ student: s.id, page: "" })}>{s.displayName}</Link>)}</nav>}
    <section className="controls" aria-label="記録の絞り込み"><div className="events"><Link className={!event ? "selected" : ""} href={queryString({ event: "", page: "" })}>すべて</Link>{events.map(item => <Link key={item.event} className={event === item.event ? "selected" : ""} href={queryString({ event: item.event, page: "" })}>{item.event}</Link>)}</div><Link className="subtle" href={queryString({ show: showCancelled ? "" : "all", page: "" })}>{showCancelled ? "有効な記録のみ" : "取消も表示"}</Link></section>
    <div className="list-head"><h2>{event || "すべての種目"}</h2><span>{total}件</span></div>
    {records.length ? <div className="records">{records.map(record => <JournalRow key={record.id} record={{ ...record, practicedAt: record.practicedAt.toISOString().slice(0, 10) }} isCoach={user.isCoach} />)}</div> : <p className="empty">該当する練習記録はありません。</p>}
    {total > 30 && <nav className="pagination">{page > 1 && <Link href={queryString({ page: String(page - 1) })}>前へ</Link>}<span>{page} / {Math.ceil(total / 30)} ページ</span>{page * 30 < total && <Link href={queryString({ page: String(page + 1) })}>次へ</Link>}</nav>}
  </main>;
}

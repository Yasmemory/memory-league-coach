"use client";
import { useState } from "react";
type RecordData = {
  id: string; practicedAt: string; event: string; status: string;
  count: number | null; score: number | null; correct: number | null;
  timeSeconds: number | null; messageUrl: string | null;
  strategy: string; reflection: string; nextAction: string; coachComment: string;
};
export function JournalRow({ record, isCoach }: { record: RecordData; isCoach: boolean }) {
  const [values, setValues] = useState({
    strategy: record.strategy, reflection: record.reflection,
    nextAction: record.nextAction, coachComment: record.coachComment,
  });
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setSaved("");
    try {
      const body = isCoach ? { coachComment: values.coachComment } : {
        strategy: values.strategy, reflection: values.reflection, nextAction: values.nextAction,
      };
      const response = await fetch("/api/records/" + encodeURIComponent(record.id), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("保存できませんでした。");
      setSaved("保存しました");
    } catch { setSaved("保存できませんでした。もう一度お試しください。"); }
    finally { setBusy(false); }
  }
  return <article className="record"><div className="record-top"><div><time>{record.practicedAt}</time><h3>{record.event}</h3></div><span className={record.status === "有効" ? "badge" : "badge cancelled"}>{record.status}</span></div>
    <div className="metrics"><span>スコア <strong>{record.score ?? "—"}</strong></span><span>正解 <strong>{record.correct ?? "—"}</strong></span><span>時間 <strong>{record.timeSeconds === null ? "—" : record.timeSeconds + "秒"}</strong></span>{record.count !== null && record.count > 1 && <span>回数 <strong>{record.count}</strong></span>}</div>
    {record.messageUrl && <a className="origin" href={record.messageUrl} target="_blank" rel="noopener noreferrer">Discordの報告を見る ↗</a>}
    {isCoach ? <><div className="student-notes"><p><b>作戦</b>{values.strategy || "未記入"}</p><p><b>振り返り</b>{values.reflection || "未記入"}</p><p><b>次回試すこと</b>{values.nextAction || "未記入"}</p></div><label>講師コメント<textarea maxLength={4000} value={values.coachComment} onChange={e => setValues({ ...values, coachComment: e.target.value })} /></label></>
      : <div className="fields"><label>今回の作戦<textarea maxLength={4000} value={values.strategy} onChange={e => setValues({ ...values, strategy: e.target.value })} placeholder="試したことを一言でも" /></label><label>振り返り<textarea maxLength={4000} value={values.reflection} onChange={e => setValues({ ...values, reflection: e.target.value })} placeholder="うまくいった点、難しかった点" /></label><label>次回試すこと<textarea maxLength={4000} value={values.nextAction} onChange={e => setValues({ ...values, nextAction: e.target.value })} placeholder="次の練習で変えること" /></label>{values.coachComment && <p className="coach-note"><b>講師コメント</b>{values.coachComment}</p>}</div>}
    <div className="save-row"><span role="status">{saved}</span><button onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button></div>
  </article>;
}

import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

type Input = {
  UUID?: unknown; RegisteredAt?: unknown; TrainingDate?: unknown;
  DiscordUserId?: unknown; DisplayName?: unknown; Event?: unknown;
  Count?: unknown; Score?: unknown; Correct?: unknown;
  MessageId?: unknown; MessageUrl?: unknown; SourceType?: unknown;
  Status?: unknown; TimeSeconds?: unknown;
};
function equalSecret(actual: string, expected: string) {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
function numberOrNull(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
function text(input: unknown, max: number) {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}
function date(input: unknown) {
  if (typeof input !== "string") return null;
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(input);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d ? parsed : null;
}
function normalize(row: Input) {
  const uuid = text(row.UUID, 128);
  const discordId = text(row.DiscordUserId, 32);
  const event = text(row.Event, 120);
  const practicedAt = date(row.TrainingDate);
  const count = numberOrNull(row.Count), score = numberOrNull(row.Score), correct = numberOrNull(row.Correct), time = numberOrNull(row.TimeSeconds);
  if (!uuid || !/^\d{15,22}$/.test(discordId) || !event || !practicedAt || [count, score, correct, time].some(x => x === undefined) || (count !== null && !Number.isInteger(count))) return null;
  const url = text(row.MessageUrl, 500);
  return {
    uuid, discordId, event, practicedAt,
    registeredAt: date(row.RegisteredAt),
    displayName: text(row.DisplayName, 100) || "生徒",
    count: count as number | null, score: score as number | null,
    correct: correct as number | null, timeSeconds: time as number | null,
    messageId: text(row.MessageId, 32) || null,
    messageUrl: /^https:\/\/(discord\.com|canary\.discord\.com)\/channels\//.test(url) ? url : null,
    sourceType: text(row.SourceType, 30) || null,
    status: text(row.Status, 30) || "有効",
  };
}
export async function POST(request: Request) {
  const expected = process.env.IMPORT_SECRET;
  if (!expected || expected.length < 32) return Response.json({ error: "Import is not configured" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!equalSecret(provided, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !Array.isArray((body as { rows?: unknown }).rows) || (body as { rows: unknown[] }).rows.length > 100) {
    return Response.json({ error: "Expected rows array of at most 100 items" }, { status: 400 });
  }
  const rows = (body as { rows: unknown[] }).rows;
  const parsed = rows.map(x => x && typeof x === "object" && !Array.isArray(x) ? normalize(x as Input) : null);
  if (parsed.some(x => !x)) return Response.json({ error: "Invalid row", row: parsed.findIndex(x => !x) + 1 }, { status: 400 });
  const data = parsed as NonNullable<(typeof parsed)[number]>[];
  const unique = new Map(data.map(x => [x.uuid, x]));
  if (unique.size !== data.length) return Response.json({ error: "Duplicate UUID in batch" }, { status: 400 });
  const prisma = db();
  for (const row of data) {
    const student = await prisma.student.upsert({
      where: { discordId: row.discordId },
      create: { discordId: row.discordId, displayName: row.displayName },
      update: { displayName: row.displayName },
    });
    // Preserve student-authored fields on repeated imports. Never reassign an existing UUID to another student.
    const existing = await prisma.practiceRecord.findUnique({ where: { sourceUuid: row.uuid }, select: { studentId: true } });
    if (existing && existing.studentId !== student.id) return Response.json({ error: "UUID belongs to another student" }, { status: 409 });
    await prisma.practiceRecord.upsert({
      where: { sourceUuid: row.uuid },
      create: {
        sourceUuid: row.uuid, studentId: student.id, practicedAt: row.practicedAt,
        registeredAt: row.registeredAt, event: row.event, count: row.count,
        score: row.score, correct: row.correct, timeSeconds: row.timeSeconds,
        messageId: row.messageId, messageUrl: row.messageUrl,
        sourceType: row.sourceType, status: row.status,
      },
      update: {
        practicedAt: row.practicedAt, registeredAt: row.registeredAt,
        event: row.event, count: row.count, score: row.score, correct: row.correct,
        timeSeconds: row.timeSeconds, messageId: row.messageId,
        messageUrl: row.messageUrl, sourceType: row.sourceType, status: row.status,
      },
    });
  }
  return Response.json({ imported: data.length });
}

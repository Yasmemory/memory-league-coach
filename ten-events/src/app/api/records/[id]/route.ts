import { viewer } from "@/lib/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const current = await viewer();
  if (!current) return Response.json({ error: "Login required" }, { status: 401 });
  const { id } = await context.params;
  const prisma = db();
  const record = await prisma.practiceRecord.findUnique({ where: { id }, select: { studentId: true } });
  if (!record) return Response.json({ error: "Not found" }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid body" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const allowed = current.isCoach ? ["coachComment"] : ["strategy", "reflection", "nextAction"];
  if (!current.isCoach && record.studentId !== current.student.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !allowed.includes(key))) return Response.json({ error: "Invalid fields" }, { status: 400 });
  if (keys.some(key => typeof input[key] !== "string" || (input[key] as string).length > 4000)) return Response.json({ error: "Text must be 4000 characters or less" }, { status: 400 });
  const data = Object.fromEntries(keys.map(key => [key, (input[key] as string).trim()]));
  const updated = await prisma.practiceRecord.update({ where: { id }, data });
  return Response.json({ id: updated.id, updatedAt: updated.updatedAt });
}

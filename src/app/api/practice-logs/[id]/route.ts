import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parsePracticeLogBody, toPracticeLogResponse, toPracticeLogUpdateInput } from "@/lib/practice-log-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parsePracticeLogBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.practiceLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Practice log not found." }, { status: 404 });
    }

    if (parsed.data.officialTournamentId) {
      const tournament = await prisma.officialTournament.findUnique({ where: { id: parsed.data.officialTournamentId } });
      if (!tournament) parsed.data.officialTournamentId = null;
    }

    const log = await prisma.practiceLog.update({
      where: { id },
      data: toPracticeLogUpdateInput(parsed.data),
      include: {
        officialTournament: true,
      },
    });

    return NextResponse.json(toPracticeLogResponse(log));
  } catch {
    return NextResponse.json({ error: "Failed to update practice log." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.practiceLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Practice log not found." }, { status: 404 });
    }

    await prisma.practiceLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete practice log." }, { status: 500 });
  }
}

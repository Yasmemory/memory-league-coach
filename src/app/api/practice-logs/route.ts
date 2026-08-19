import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parsePracticeLogBody, toPracticeLogResponse } from "@/lib/practice-log-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prisma = getPrismaClient();
    const logs = await prisma.practiceLog.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        officialTournament: true,
      },
    });

    return NextResponse.json({ logs: logs.map(toPracticeLogResponse) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch practice logs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    if (parsed.data.officialTournamentId) {
      const tournament = await prisma.officialTournament.findUnique({ where: { id: parsed.data.officialTournamentId } });
      if (!tournament) parsed.data.officialTournamentId = null;
    }

    const log = await prisma.practiceLog.create({
      data: parsed.data,
      include: {
        officialTournament: true,
      },
    });

    return NextResponse.json(toPracticeLogResponse(log), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save practice log." }, { status: 500 });
  }
}

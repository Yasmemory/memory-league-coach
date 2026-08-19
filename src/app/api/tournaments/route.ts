import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parseTournamentBody, toTournamentResponse } from "@/lib/tournament-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prisma = getPrismaClient();
    const tournaments = await prisma.tournament.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json({ tournaments: tournaments.map(toTournamentResponse) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tournaments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseTournamentBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const prisma = getPrismaClient();
    const tournament = await prisma.tournament.create({ data: parsed.data });
    return NextResponse.json(toTournamentResponse(tournament), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save tournament." }, { status: 500 });
  }
}

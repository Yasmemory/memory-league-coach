import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parseOfficialTournamentBody, toOfficialTournamentResponse } from "@/lib/tournament-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prisma = getPrismaClient();
    const officialTournaments = await prisma.officialTournament.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json({ officialTournaments: officialTournaments.map(toOfficialTournamentResponse) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch official tournaments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseOfficialTournamentBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const prisma = getPrismaClient();
    const officialTournament = await prisma.officialTournament.create({ data: parsed.data });
    return NextResponse.json(toOfficialTournamentResponse(officialTournament), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save official tournament." }, { status: 500 });
  }
}

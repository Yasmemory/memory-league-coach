import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parseTournamentBody, toTournamentResponse } from "@/lib/tournament-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
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
    const existing = await prisma.tournament.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    const tournament = await prisma.tournament.update({ where: { id }, data: parsed.data });
    return NextResponse.json(toTournamentResponse(tournament));
  } catch {
    return NextResponse.json({ error: "Failed to update tournament." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.tournament.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    await prisma.tournament.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete tournament." }, { status: 500 });
  }
}

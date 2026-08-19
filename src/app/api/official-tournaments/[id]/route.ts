import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parseOfficialTournamentBody, toOfficialTournamentResponse } from "@/lib/tournament-api";

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

  const parsed = parseOfficialTournamentBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.officialTournament.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Official tournament not found." }, { status: 404 });
    const officialTournament = await prisma.officialTournament.update({ where: { id }, data: parsed.data });
    return NextResponse.json(toOfficialTournamentResponse(officialTournament));
  } catch {
    return NextResponse.json({ error: "Failed to update official tournament." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.officialTournament.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Official tournament not found." }, { status: 404 });
    await prisma.officialTournament.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete official tournament." }, { status: 500 });
  }
}

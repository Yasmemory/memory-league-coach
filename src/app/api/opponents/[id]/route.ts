import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parseOpponentBody, toOpponentResponse } from "@/lib/opponent-api";

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

  const parsed = parseOpponentBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.opponent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Opponent not found." }, { status: 404 });
    const opponent = await prisma.opponent.update({ where: { id }, data: parsed.data });
    return NextResponse.json(toOpponentResponse(opponent));
  } catch {
    return NextResponse.json({ error: "Failed to update opponent." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.opponent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Opponent not found." }, { status: 404 });
    await prisma.opponent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete opponent." }, { status: 500 });
  }
}

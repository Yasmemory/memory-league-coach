import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { parseOpponentBody, toOpponentResponse } from "@/lib/opponent-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prisma = getPrismaClient();
    const opponents = await prisma.opponent.findMany({ orderBy: [{ createdAt: "desc" }] });
    return NextResponse.json({ opponents: opponents.map(toOpponentResponse) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch opponents." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    const opponent = await prisma.opponent.create({ data: parsed.data });
    return NextResponse.json(toOpponentResponse(opponent), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save opponent." }, { status: 500 });
  }
}

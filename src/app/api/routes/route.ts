import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { isUniqueConstraintError, parseRouteBody, toRouteResponse } from "@/lib/route-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prisma = getPrismaClient();
    const routes = await prisma.route.findMany({ orderBy: [{ discipline: "asc" }, { name: "asc" }] });
    return NextResponse.json({ routes: routes.map(toRouteResponse) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch routes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseRouteBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const route = await getPrismaClient().route.create({ data: parsed.data });
    return NextResponse.json(toRouteResponse(route), { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "A route with this name already exists for the discipline." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to save route." }, { status: 500 });
  }
}

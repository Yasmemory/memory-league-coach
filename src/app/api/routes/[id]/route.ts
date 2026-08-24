import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { isUniqueConstraintError, parseRoutePatchBody, toRouteResponse } from "@/lib/route-api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseRoutePatchBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Route not found." }, { status: 404 });
    const route = await prisma.route.update({ where: { id }, data: parsed.data });
    return NextResponse.json(toRouteResponse(route));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "A route with this name already exists for the discipline." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update route." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Route not found." }, { status: 404 });
    await prisma.route.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete route." }, { status: 500 });
  }
}

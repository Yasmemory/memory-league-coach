import { getPrismaClient } from "@/lib/prisma";
import { createExtensionFingerprint, parsePracticeLogBody, toPracticeLogResponse } from "@/lib/practice-log-api";
import { validatePracticeLogRoute } from "@/lib/route-api";
import { authorizeExtensionRequest, extensionCorsHeaders, extensionJsonResponse } from "@/lib/extension-auth";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCorsHeaders });
}

export async function POST(request: Request) {
  const auth = authorizeExtensionRequest(request);
  if (!auth.ok) {
    return extensionJsonResponse({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return extensionJsonResponse({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parsePracticeLogBody(isRecord(body) ? { ...body, source: "extension" } : body);
  if ("error" in parsed) {
    return extensionJsonResponse({ error: parsed.error }, { status: 400 });
  }

  const data = {
    ...parsed.data,
    source: "extension" as const,
    extensionFingerprint: createExtensionFingerprint(parsed.data),
  };

  try {
    const prisma = getPrismaClient();
    const routeError = await validatePracticeLogRoute(data, (id) => prisma.route.findUnique({
      where: { id },
      select: { id: true, discipline: true },
    }));
    if (routeError) return extensionJsonResponse({ error: routeError }, { status: 400 });

    const existingLog = await prisma.practiceLog.findFirst({
      where: { extensionFingerprint: data.extensionFingerprint },
      include: { officialTournament: true, route: true },
    });

    if (existingLog) {
      return extensionJsonResponse(toPracticeLogResponse(existingLog), { status: 200 });
    }

    if (data.officialTournamentId) {
      const tournament = await prisma.officialTournament.findUnique({ where: { id: data.officialTournamentId } });
      if (!tournament) data.officialTournamentId = null;
    }

    const log = await prisma.practiceLog.create({
      data,
      include: { officialTournament: true, route: true },
    });

    return extensionJsonResponse(toPracticeLogResponse(log), { status: 201 });
  } catch {
    return extensionJsonResponse({ error: "Failed to save practice log." }, { status: 500 });
  }
}

import { getPrismaClient } from "@/lib/prisma";
import { authorizeExtensionRequest, extensionCorsHeaders, extensionJsonResponse } from "@/lib/extension-auth";
import { toExtensionOfficialTournamentResponse } from "@/lib/tournament-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCorsHeaders });
}

export async function GET(request: Request) {
  const auth = authorizeExtensionRequest(request);
  if (!auth.ok) return extensionJsonResponse({ error: auth.error }, { status: auth.status });
  try {
    const tournaments = await getPrismaClient().officialTournament.findMany({
      orderBy: [{ date: "asc" }, { name: "asc" }],
      select: { id: true, name: true, date: true },
    });
    return extensionJsonResponse(tournaments.map(toExtensionOfficialTournamentResponse));
  } catch {
    return extensionJsonResponse({ error: "Failed to fetch official tournaments." }, { status: 500 });
  }
}

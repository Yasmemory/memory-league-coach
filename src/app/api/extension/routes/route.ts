import { getPrismaClient } from "@/lib/prisma";
import { authorizeExtensionRequest, extensionCorsHeaders, extensionJsonResponse } from "@/lib/extension-auth";
import { toExtensionRouteResponse } from "@/lib/route-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCorsHeaders });
}

export async function GET(request: Request) {
  const auth = authorizeExtensionRequest(request);
  if (!auth.ok) return extensionJsonResponse({ error: auth.error }, { status: auth.status });

  try {
    const routes = await getPrismaClient().route.findMany({
      where: { discipline: { in: ["Cards", "Numbers", "Images", "Words"] } },
      orderBy: [{ discipline: "asc" }, { name: "asc" }],
      select: { id: true, name: true, discipline: true },
    });
    return extensionJsonResponse(routes.map(toExtensionRouteResponse));
  } catch {
    return extensionJsonResponse({ error: "Failed to fetch routes." }, { status: 500 });
  }
}

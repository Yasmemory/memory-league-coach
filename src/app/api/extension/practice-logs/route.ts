import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { createExtensionFingerprint, parsePracticeLogBody, toPracticeLogResponse } from "@/lib/practice-log-api";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init?.headers,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function tokensMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function authorizeExtensionRequest(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized." };
  }

  const expectedToken = process.env.EXTENSION_API_TOKEN;
  if (!expectedToken) {
    return { ok: false as const, status: 500, error: "Extension API is not configured." };
  }

  if (!tokensMatch(token, expectedToken)) {
    return { ok: false as const, status: 401, error: "Unauthorized." };
  }

  return { ok: true as const };
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const auth = authorizeExtensionRequest(request);
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parsePracticeLogBody(isRecord(body) ? { ...body, source: "extension" } : body);
  if ("error" in parsed) {
    return jsonResponse({ error: parsed.error }, { status: 400 });
  }

  const data = {
    ...parsed.data,
    source: "extension" as const,
    extensionFingerprint: createExtensionFingerprint(parsed.data),
  };

  try {
    const prisma = getPrismaClient();

    const existingLog = await prisma.practiceLog.findFirst({
      where: { extensionFingerprint: data.extensionFingerprint },
      include: { officialTournament: true },
    });

    if (existingLog) {
      return jsonResponse(toPracticeLogResponse(existingLog), { status: 200 });
    }

    if (data.officialTournamentId) {
      const tournament = await prisma.officialTournament.findUnique({ where: { id: data.officialTournamentId } });
      if (!tournament) data.officialTournamentId = null;
    }

    const log = await prisma.practiceLog.create({
      data,
      include: { officialTournament: true },
    });

    return jsonResponse(toPracticeLogResponse(log), { status: 201 });
  } catch {
    return jsonResponse({ error: "Failed to save practice log." }, { status: 500 });
  }
}

import { timingSafeEqual } from "crypto";

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function tokensMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function authorizeExtensionRequest(request: Request) {
  const token = getBearerToken(request);
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized." };
  const expectedToken = process.env.EXTENSION_API_TOKEN;
  if (!expectedToken) return { ok: false as const, status: 500, error: "Extension API is not configured." };
  if (!tokensMatch(token, expectedToken)) return { ok: false as const, status: 401, error: "Unauthorized." };
  return { ok: true as const };
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

export const SESSION_NAME = "journal_session";
const maxAge = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain 32+ characters");
  return value;
}
function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function makeSession(discordId: string) {
  const payload = Buffer.from(JSON.stringify({ discordId, exp: Date.now() + maxAge * 1000 })).toString("base64url");
  return payload + "." + signature(payload);
}
export function verifySession(raw: string | undefined) {
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac || !/^[a-f0-9]{64}$/.test(mac)) return null;
  const expected = Buffer.from(signature(payload), "hex");
  if (!timingSafeEqual(expected, Buffer.from(mac, "hex"))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { discordId?: unknown; exp?: unknown };
    return typeof parsed.discordId === "string" && /^\d{15,22}$/.test(parsed.discordId) && typeof parsed.exp === "number" && parsed.exp > Date.now() ? parsed.discordId : null;
  } catch { return null; }
}
export async function viewer() {
  const discordId = verifySession((await cookies()).get(SESSION_NAME)?.value);
  if (!discordId) return null;
  const student = await db().student.findUnique({ where: { discordId } });
  if (!student) return null;
  const admins = (process.env.DISCORD_ADMIN_IDS ?? "").split(",").map(s => s.trim());
  return { student, isCoach: admins.includes(discordId) };
}
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };

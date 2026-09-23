import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookieOptions, makeSession, SESSION_NAME } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const origin = process.env.APP_ORIGIN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!origin || !clientId || !clientSecret) return Response.json({ error: "Discord login is not configured" }, { status: 503 });
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const saved = request.cookies.get("oauth_state")?.value ?? "";
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !state || !saved || state.length !== saved.length || !timingSafeEqual(Buffer.from(state), Buffer.from(saved))) {
    return NextResponse.redirect(new URL("/?error=login", origin));
  }
  const token = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: new URL("/api/auth/callback", origin).toString() }),
    cache: "no-store",
  });
  if (!token.ok) return NextResponse.redirect(new URL("/?error=login", origin));
  const { access_token } = await token.json() as { access_token?: string };
  if (!access_token) return NextResponse.redirect(new URL("/?error=login", origin));
  const profileResponse = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${access_token}` }, cache: "no-store" });
  if (!profileResponse.ok) return NextResponse.redirect(new URL("/?error=login", origin));
  const profile = await profileResponse.json() as { id?: string; global_name?: string; username?: string };
  if (!profile.id || !/^\d{15,22}$/.test(profile.id)) return NextResponse.redirect(new URL("/?error=login", origin));
  await db().student.upsert({
    where: { discordId: profile.id },
    create: { discordId: profile.id, displayName: profile.global_name || profile.username || "生徒" },
    update: { displayName: profile.global_name || profile.username || "生徒" },
  });
  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set(SESSION_NAME, makeSession(profile.id), cookieOptions);
  response.cookies.delete("oauth_state");
  return response;
}

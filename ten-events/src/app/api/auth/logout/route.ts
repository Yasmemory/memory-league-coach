import { NextResponse } from "next/server";
import { SESSION_NAME } from "@/lib/auth";
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(SESSION_NAME);
  return response;
}

import { NextResponse } from "next/server";
export { authorizeExtensionRequest } from "@/lib/extension-auth-core";

export const extensionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function extensionJsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...extensionCorsHeaders, ...init?.headers },
  });
}

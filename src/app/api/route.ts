import { NextResponse } from "next/server";
import { getApplicationPort } from "@/server/environment";

// Lightweight liveness endpoint for local smoke tests and deployment probes.
// Database readiness is verified separately by the authenticated API routes.
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "portmasters2",
    port: getApplicationPort(),
  });
}

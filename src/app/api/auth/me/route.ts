// GET /api/auth/me: current authenticated user
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/api-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  // The session cookie is httpOnly, so return the token explicitly for the
  // Socket.IO authentication payload used by the client.
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  return NextResponse.json({ user, token });
}

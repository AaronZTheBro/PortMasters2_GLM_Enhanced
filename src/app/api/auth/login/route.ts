// POST /api/auth/login
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSession, sessionCookieMaxAge } from "@/lib/auth";
import { sessionCookie, publicUser } from "@/lib/api-auth";

const Schema = z.object({
  username: z.string().min(1).max(20),
  password: z.string().min(1).max(72),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const user = await db.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json(
      {
        error:
          "No account found with that captain name. Please check the spelling or register a new account.",
      },
      { status: 401 },
    );
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "The password you entered is incorrect." },
      { status: 401 },
    );
  }

  // Delete expired sessions before creating a new one.
  await db.session
    .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } })
    .catch(() => {});

  const { token, expiresAt } = await createSession(user.id);
  // Return the token for the Socket.IO authentication payload.
  const res = NextResponse.json({ user: publicUser(user), expiresAt, token });
  res.headers.set("Set-Cookie", sessionCookie(token, sessionCookieMaxAge));
  return res;
}

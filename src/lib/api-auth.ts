// =====================================================================
// PortMasters 2: request auth helper for API routes
// Reads the session cookie and returns the authenticated user (or null).
// =====================================================================
import { cookies } from "next/headers";
import { getUserFromToken, SESSION_COOKIE_NAME } from "./auth";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const user = await getUserFromToken(token);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarHue: user.avatarHue,
  };
}

// Serialize the session cookie header value.
export function sessionCookie(token: string, maxAgeSec: number) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// User projection safe for public lists (rooms, online users).
export function publicUser(u: {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarHue: u.avatarHue,
  };
}

// Six character readable room join code with no ambiguous characters.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRoomCode(): string {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++)
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// Avatar hue from a string (fallback when user has none).
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

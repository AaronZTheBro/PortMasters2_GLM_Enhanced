import type { VoyageRules } from "./game/expansion";
// =====================================================================
// PortMasters 2: REST API helpers (typed fetch wrappers)
// =====================================================================
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { CheckInStatus } from "@/lib/game/checkin";
import type { Difficulty } from "@/lib/game/difficulty";

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
};

export type RoomSummary = {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  started: boolean;
  difficulty: Difficulty;
  createdAt: string;
  host: PublicUser;
  memberCount: number;
  members: Array<PublicUser & { joinedAt: string }>;
};

export type RoomDetail = RoomSummary & { isMember: boolean };

export type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  sender: PublicUser;
  mine?: boolean;
  recipient?: PublicUser;
};

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
  } catch {
    throw new Error("Cannot reach the server. It may be temporarily offline.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      data?.error || `Server error (${res.status}). Please try again later.`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  // Auth
  me: () =>
    jfetch<{ user: PublicUser | null; token: string | null }>("/api/auth/me"),
  register: (body: {
    username: string;
    password: string;
    displayName?: string;
  }) =>
    jfetch<{ user: PublicUser; expiresAt: string; token: string }>(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  login: (body: { username: string; password: string }) =>
    jfetch<{ user: PublicUser; expiresAt: string; token: string }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  logout: () => jfetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // Rooms
  listRooms: () => jfetch<{ rooms: RoomSummary[] }>("/api/rooms"),
  createRoom: (body: {
    name: string;
    isPublic?: boolean;
    difficulty?: Difficulty;
  }) =>
    jfetch<{ room: RoomSummary }>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRoom: (id: string) =>
    jfetch<{ room: RoomDetail; messages: ChatMessage[] }>(`/api/rooms/${id}`),
  // The room this captain is still seated in, or null. Used on page load to
  // put a captain who merely reloaded back aboard instead of stranding them
  // in the Lobby while the harbor waits on their ready vote; see
  // src/app/api/rooms/active/route.ts for why membership, not client state,
  // is the thing asked.
  getActiveRoom: () => jfetch<{ room: RoomDetail | null }>("/api/rooms/active"),
  joinRoomById: (id: string) =>
    jfetch<{ room: RoomSummary }>(`/api/rooms/${id}/join`, { method: "POST" }),
  joinRoomByCode: (code: string) =>
    jfetch<{ room: RoomSummary }>("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  leaveRoom: (id: string) =>
    jfetch<{ ok: true }>(`/api/rooms/${id}/leave`, { method: "POST" }),

  // Game state
  getGameState: (roomId: string) =>
    jfetch<{
      state: string | null;
      revision: number | null;
      checkpoint: {
        currentRound: number;
        currentPhase: string;
        voyageEpoch: number;
        harborPulse?: Record<string, number>;
      } | null;
      difficulty: Difficulty;
      rules?: VoyageRules;
      tidewatchSurge: boolean;
      docksWon: boolean;
    }>(`/api/game/state?roomId=${roomId}`),
  saveGameState: (roomId: string, data: unknown, revision: number | null) =>
    jfetch<{ ok: true; updatedAt: string; revision: number }>(
      "/api/game/state",
      {
        method: "PUT",
        body: JSON.stringify({ roomId, data, revision }),
      },
    ),

  // DMs
  getDmHistory: (otherUserId: string) =>
    jfetch<{ other: PublicUser; messages: ChatMessage[] }>(
      `/api/messages/dm/${otherUserId}`,
    ),

  // Captain's Legacy (persistent Renown, across every voyage the account has played).
  // The current user's own legacy also carries their Daily Check In status.
  getLegacy: () =>
    jfetch<{ legacy: CaptainLegacySummary; checkIn: CheckInStatus }>(
      "/api/legacy",
    ),
  getLegacyFor: (userId: string) =>
    jfetch<{ legacy: CaptainLegacySummary }>(`/api/legacy/${userId}`),
  getLegaciesFor: (userIds: string[]) =>
    jfetch<{ legacies: Record<string, CaptainLegacySummary> }>(
      "/api/legacy/batch",
      {
        method: "POST",
        body: JSON.stringify({ userIds }),
      },
    ),

  // Daily Check In: claim today's reward. Returns claimed:false (not an
  // error) when today was already claimed, so the caller can simply render
  // again.
  checkIn: () =>
    jfetch<{
      claimed: boolean;
      day?: number;
      xpGained?: number;
      leveledUp?: boolean;
      legacy: CaptainLegacySummary;
      checkIn: CheckInStatus;
    }>("/api/check-in", { method: "POST" }),

  // Harborwide stats: totals, top renown leaderboard, recent rooms. Used by
  // Harbor Overview to make the server feel alive even with one captain
  // online. This read only request accepts no user input.
  stats: () =>
    jfetch<{
      totals: {
        captains: number;
        rooms: number;
        sailing: number;
        voyages: number;
        crowns: number;
      };
      leaderboard: Array<{
        rank: number;
        user: PublicUser;
        renownLevel: number;
        renownXP: number;
        voyages: number;
        crowns: number;
        bestScore: number;
      }>;
      recentRooms: Array<{
        id: string;
        name: string;
        code: string;
        difficulty: Difficulty;
        started: boolean;
        createdAt: string;
        host: PublicUser;
        memberCount: number;
      }>;
      activities: Array<{
        id: string;
        type: string;
        detail: string | null;
        createdAt: string;
        user: PublicUser | null;
      }>;
      generatedAt: string;
    }>("/api/stats"),

  // The public roster of every captain on the server, with their headline
  // stats (Renown, voyages, crowns, best score, merit count). Backs the
  // Captains Directory dialog in the lobby. Paginated and sortable; the
  // optional `q` parameter filters by displayName or username substring.
  listCaptains: (opts?: {
    q?: string;
    sort?: "renown" | "voyages" | "crowns" | "best" | "joined" | "name";
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return jfetch<{
      total: number;
      captains: Array<{
        id: string;
        username: string;
        displayName: string;
        avatarHue: number;
        createdAt: string;
        renownLevel: number;
        renownXP: number;
        renownTitle: string;
        voyages: number;
        crowns: number;
        bestScore: number;
        merits: number;
        isMe: boolean;
      }>;
      generatedAt: string;
    }>(`/api/captains${qs ? `?${qs}` : ""}`);
  },

  // The current user's full profile: account info, persistent Renown/
  // Legacy stats, breakdown by difficulty, every Merit earned (hydrated
  // against the static catalogue), the 20 most recent activities they
  // personally triggered, and the rooms they're currently a member of.
  // Backs the Captain Profile dialog in the lobby.
  getProfile: () =>
    jfetch<{
      user: PublicUser & { createdAt: string };
      legacy: {
        renownLevel: number;
        renownXP: number;
        voyagesCompleted: number;
        seaMasterCrowns: number;
        bestScore: number;
        meritIds: string[];
      };
      renown: {
        level: number;
        title: string;
        xpIntoLevel: number;
        xpForNextLevel: number;
        xpTotal: number;
      };
      merits: Array<{
        id: string;
        name: string;
        desc: string;
        earnedAt: string;
      }>;
      // Merits the captain has NOT yet earned, with measurable progress
      // (current/target + unit) joined against the static catalogue. The
      // profile dialog renders these as goal cards below the earned ones.
      lockedMerits: Array<{
        id: string;
        name: string;
        desc: string;
        current: number;
        target: number;
        unit: string;
      }>;
      difficulties: Array<{
        key: string;
        name: string;
        icon: string;
        crowns: number;
        bestScore: number;
      }>;
      activities: Array<{
        id: string;
        type: string;
        detail: string | null;
        createdAt: string;
      }>;
      rooms: Array<{
        id: string;
        name: string;
        code: string;
        difficulty: Difficulty;
        started: boolean;
        createdAt: string;
        joinedAt: string;
        host: PublicUser;
      }>;
      checkIn: CheckInStatus;
      generatedAt: string;
    }>("/api/profile"),
};

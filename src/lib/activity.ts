// =====================================================================
// PortMasters 2: harbor activity feed helpers
// Records notable events (register, check in, room create, voyage start,
// voyage complete, sea master, merit earned) into the Activity table for
// the lobby feed to read back. Kept tiny and limited to recording effects so
// any route or socket handler can drop in a call without ceremony.
// =====================================================================
import { db } from "@/lib/db";

export type ActivityType =
  | "register"
  | "check_in"
  | "room_create"
  | "voyage_start"
  | "voyage_complete"
  | "sea_master"
  | "merit_earned";

// One row per event. Never throws: the feed is decorative, and a failed
// insert must not break the request that triggered it (a check in still
// succeeds even if the activity row fails to land).
export async function recordActivity(args: {
  userId?: string;
  type: ActivityType;
  detail?: string;
  roomId?: string;
}): Promise<void> {
  try {
    await db.activity.create({
      data: {
        userId: args.userId ?? null,
        type: args.type,
        detail: args.detail ?? null,
        roomId: args.roomId ?? null,
      },
    });
    // Each insert prunes activity older than thirty days.
    await db.activity.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
        },
      },
    });
  } catch {
    /* decorative; never break the caller */
  }
}

// GET /api/captains returns a searchable, sortable public captain directory.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import { renownProgress, renownTitleForLevel } from "@/lib/game/legacy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await getCurrentUser();
  if (!authed)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = (url.searchParams.get("sort") ?? "renown").toLowerCase();
  // Cap each page at 50 captains.
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") ?? "30")),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  // Match the query against display names and usernames.
  const where = q
    ? {
        OR: [{ displayName: { contains: q } }, { username: { contains: q } }],
      }
    : {};

  // Map allowed sort keys to stable Prisma ordering.
  const orderBy = (() => {
    switch (sort) {
      case "renown":
        return [
          { legacy: { renownXP: "desc" as const } },
          { createdAt: "desc" as const },
        ];
      case "voyages":
        return [
          { legacy: { voyagesCompleted: "desc" as const } },
          { createdAt: "desc" as const },
        ];
      case "crowns":
        return [
          { legacy: { seaMasterCrowns: "desc" as const } },
          { createdAt: "desc" as const },
        ];
      case "best":
        return [
          { legacy: { bestScore: "desc" as const } },
          { createdAt: "desc" as const },
        ];
      case "joined":
        return [{ createdAt: "asc" as const }];
      case "name":
        return [{ displayName: "asc" as const }];
      default:
        return [
          { legacy: { renownXP: "desc" as const } },
          { createdAt: "desc" as const },
        ];
    }
  })();

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarHue: true,
        createdAt: true,
        legacy: {
          select: {
            renownLevel: true,
            renownXP: true,
            voyagesCompleted: true,
            seaMasterCrowns: true,
            bestScore: true,
          },
        },
        _count: {
          select: { merits: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    captains: rows.map((row) => {
      const xp = row.legacy?.renownXP ?? 0;
      const progress = renownProgress(xp);
      return {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        avatarHue: row.avatarHue,
        createdAt: row.createdAt,
        renownLevel: row.legacy?.renownLevel ?? 1,
        renownXP: xp,
        renownTitle: renownTitleForLevel(progress.level),
        voyages: row.legacy?.voyagesCompleted ?? 0,
        crowns: row.legacy?.seaMasterCrowns ?? 0,
        bestScore: row.legacy?.bestScore ?? 0,
        merits: row._count.merits,
        isMe: row.id === authed.id,
      };
    }),
    generatedAt: new Date().toISOString(),
  });
}

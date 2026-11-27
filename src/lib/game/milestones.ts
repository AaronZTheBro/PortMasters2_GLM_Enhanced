import { PRODUCTS } from "./constants";
import type { GameState } from "./types";

export type MilestoneId =
  | "gold_100"
  | "gold_500"
  | "gold_1000"
  | "rep_100"
  | "rep_500"
  | "rep_1000"
  | "first_artisan"
  | "first_product"
  | "first_module";

type Milestone = {
  id: MilestoneId;
  name: string;
  emoji: string;
  check: (game: GameState) => boolean;
};

export const MILESTONES: Milestone[] = [
  {
    id: "gold_100",
    name: "First 100 Gold",
    emoji: "💰",
    check: (g) => g.money >= 100,
  },
  {
    id: "gold_500",
    name: "Merchant's Purse",
    emoji: "👛",
    check: (g) => g.money >= 500,
  },
  {
    id: "gold_1000",
    name: "Chest of Riches",
    emoji: "👑",
    check: (g) => g.money >= 1000,
  },
  {
    id: "rep_100",
    name: "Known Trader",
    emoji: "⭐",
    check: (g) => g.score >= 100,
  },
  {
    id: "rep_500",
    name: "Respected Captain",
    emoji: "🌟",
    check: (g) => g.score >= 500,
  },
  {
    id: "rep_1000",
    name: "Legend of the Silk Road",
    emoji: "🏆",
    check: (g) => g.score >= 1000,
  },
  {
    id: "first_artisan",
    name: "First Artisan",
    emoji: "🛠️",
    check: (g) => Object.values(g.workers).some((crew) => crew.length > 0),
  },
  {
    id: "first_product",
    name: "First Goods",
    emoji: "📦",
    check: (g) => PRODUCTS.some((p) => (g.inventory[p] ?? 0) > 0),
  },
  {
    id: "first_module",
    name: "First Ship Module",
    emoji: "🚢",
    check: (g) => g.equippedModules.length > 0,
  },
];

export function recordVoyageMilestones(game: GameState) {
  if (game.phase === 0) return;
  for (const milestone of MILESTONES) {
    if (!game.milestones?.includes(milestone.id) && milestone.check(game)) {
      (game.milestones ??= []).push(milestone.id);
    }
  }
}

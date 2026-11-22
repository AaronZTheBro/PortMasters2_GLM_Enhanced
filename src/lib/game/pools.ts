// Builds round content pools from canonical data and difficulty schedules.
import {
  BOONS_TIER0,
  BOONS_TIER1,
  BOONS_TIER2,
  MODULES_TIER0,
  MODULES_TIER1,
  MODULES_TIER2,
  PORTS_TIER0,
  PORTS_TIER1,
  PORTS_TIER2,
  PRODUCTS_TIER0,
  PRODUCTS_TIER1,
  PRODUCTS_TIER2,
  RECIPES,
  RESOURCES_TIER0,
  RESOURCES_TIER1,
  RESOURCES_TIER2,
  RESOURCE_WEIGHTS,
  WORKER_TYPES,
  type Boon,
  type Module,
  type WorkerType,
} from "./constants";
import { unlockedPool, unlockedTierFor } from "./difficulty";

export function unlockedResources(
  difficulty: unknown,
  roundNo: number,
): string[] {
  return unlockedPool<string>(
    [RESOURCES_TIER0, RESOURCES_TIER1, RESOURCES_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedProducts(
  difficulty: unknown,
  roundNo: number,
): string[] {
  return unlockedPool<string>(
    [PRODUCTS_TIER0, PRODUCTS_TIER1, PRODUCTS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedPorts(difficulty: unknown, roundNo: number): string[] {
  return unlockedPool<string>(
    [PORTS_TIER0, PORTS_TIER1, PORTS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedBoons(difficulty: unknown, roundNo: number): Boon[] {
  return unlockedPool<Boon>(
    [BOONS_TIER0, BOONS_TIER1, BOONS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedModules(
  difficulty: unknown,
  roundNo: number,
): Module[] {
  return unlockedPool<Module>(
    [MODULES_TIER0, MODULES_TIER1, MODULES_TIER2],
    difficulty,
    roundNo,
  );
}

// Worker definitions carry their own unlock tier.
export function unlockedWorkerTypes(
  difficulty: unknown,
  roundNo: number,
): WorkerType[] {
  const tier = unlockedTierFor(difficulty, roundNo);
  return WORKER_TYPES.filter((w) => w.tier <= tier);
}

// Normalizes unlocked resource weights into draw probabilities.
export function unlockedResourceDraw(
  difficulty: unknown,
  roundNo: number,
): { items: string[]; probs: number[] } {
  const items = unlockedResources(difficulty, roundNo);
  const weights = items.map((i) => RESOURCE_WEIGHTS[i] ?? 0);
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  return { items, probs: weights.map((w) => w / total) };
}

// Identifies goods introduced by a charter.
export function isCharterGood(item: string): boolean {
  return (
    (RESOURCES_TIER1 as readonly string[]).includes(item) ||
    (PRODUCTS_TIER1 as readonly string[]).includes(item) ||
    (RESOURCES_TIER2 as readonly string[]).includes(item) ||
    (PRODUCTS_TIER2 as readonly string[]).includes(item)
  );
}

export function isSilkProduct(item: string): boolean {
  return (RECIPES[item]?.materials.Silk ?? 0) > 0;
}
